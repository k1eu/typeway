/**
 * Paired A/B throughput benchmarks for the Typeway glue.
 *
 * Every number here is a *comparison*, never an absolute claim: each scenario
 * boots a baseline server and a Typeway server, drives identical load at both,
 * and reports the ratio. Arms are interleaved round-by-round (baseline, typeway,
 * baseline, typeway, ...) rather than run in two blocks, so that machine load
 * drifting over the course of a run perturbs both arms equally. Only one server
 * is ever listening at a time.
 *
 *   bun bench/run.ts                    # full suite
 *   bun bench/run.ts --smoke            # one request per arm, no load (fast check)
 *   bun bench/run.ts --only bridge      # filter scenarios by substring
 *   bun bench/run.ts --generator fallback
 *   bun bench/run.ts --duration 5 --runs 1
 *
 * See bench/README.md for methodology and caveats.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type GeneratorName,
	type LoadSample,
	OHA_INSTALL_HINT,
	findOha,
	ohaVersion,
	runLoad,
} from "./lib/loadgen.ts";

const BENCH_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(BENCH_DIR, "..");
const APP_DIR = join(REPO_DIR, "apps/playground-with-tanstack");
const SERVERS = join(BENCH_DIR, "servers");

// ------------------------------------------------------------------- config

interface Options {
	generator: GeneratorName | "auto";
	durationSec: number;
	warmupSec: number;
	connections: number;
	runs: number;
	only: string | null;
	smoke: boolean;
	macro: boolean;
	build: boolean;
	out: string | null;
	note: string | null;
}

function parseArgs(argv: string[]): Options {
	const options: Options = {
		generator: "auto",
		durationSec: 10,
		warmupSec: 3,
		connections: 64,
		runs: 3,
		only: null,
		smoke: false,
		macro: true,
		build: true,
		out: null,
		note: null,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const value = () => {
			const next = argv[++i];
			if (next === undefined) throw new Error(`${arg} requires a value`);
			return next;
		};

		switch (arg) {
			case "--generator": {
				const g = value();
				if (g !== "oha" && g !== "fallback" && g !== "auto") {
					throw new Error(`--generator must be oha|fallback|auto, got ${g}`);
				}
				options.generator = g;
				break;
			}
			case "--duration":
				options.durationSec = Number(value());
				break;
			case "--warmup":
				options.warmupSec = Number(value());
				break;
			case "--connections":
			case "-c":
				options.connections = Number(value());
				break;
			case "--runs":
				options.runs = Number(value());
				break;
			case "--only":
				options.only = value();
				break;
			case "--smoke":
				options.smoke = true;
				break;
			case "--no-macro":
				options.macro = false;
				break;
			case "--no-build":
				options.build = false;
				break;
			case "--out":
				options.out = value();
				break;
			case "--note":
				options.note = value();
				break;
			case "--help":
			case "-h":
				console.log(USAGE);
				process.exit(0);
				break;
			default:
				throw new Error(`unknown argument: ${arg}`);
		}
	}

	return options;
}

const USAGE = `bun bench/run.ts [options]

  --generator oha|fallback|auto   load generator (default: auto — oha if installed)
  --duration <sec>                measured run length (default: 10)
  --warmup <sec>                  discarded warmup per boot (default: 3)
  --connections <n>, -c <n>       concurrent connections (default: 64)
  --runs <n>                      measured runs per arm, median kept (default: 3)
  --only <substr>                 run only scenarios whose id/label matches
  --smoke                         one request per arm, no load generation
  --no-macro                      skip the TanStack (C/D) scenarios
  --no-build                      do not auto-build the TanStack app if dist/ is missing
  --out <path>                    results JSON path (default: bench/results/<date>-<machine>.json)
  --note <text>                   free-text note recorded in the results JSON
`;

// ---------------------------------------------------------------- scenarios

interface Arm {
	label: string;
	cmd: string[];
	cwd?: string;
	path: string;
	method?: string;
	body?: string;
	contentType?: string;
}

interface Scenario {
	id: string;
	label: string;
	question: string;
	claim?: string;
	baseline: Arm;
	typeway: Arm;
}

/** 1 KB-ish JSON payload for the body-streaming scenario. */
const POST_BODY = JSON.stringify({ pad: "x".repeat(950) });

function buildScenarios(assetPath: string, macro: boolean): Scenario[] {
	const scenarios: Scenario[] = [
		{
			id: "registered-route-get",
			label: "registered route (GET /json)",
			question: "Does mounting connect() slow down natively registered Elysia routes?",
			claim: "<= ~2% delta (route precedence means the bridge is never entered)",
			baseline: {
				label: "elysia-plain",
				cmd: ["bun", "run", join(SERVERS, "elysia-plain.ts")],
				path: "/json",
			},
			typeway: {
				label: "elysia-with-connect",
				cmd: ["bun", "run", join(SERVERS, "elysia-with-connect.ts")],
				path: "/json",
			},
		},
		{
			id: "bridge-res-end-get",
			label: "bridge res.end (GET /ok)",
			question: "What does a request cost when it actually traverses the bridge?",
			baseline: {
				label: "elysia-handler",
				cmd: ["bun", "run", join(SERVERS, "elysia-handler.ts")],
				path: "/ok",
			},
			typeway: {
				label: "bridge-direct",
				cmd: ["bun", "run", join(SERVERS, "bridge-direct.ts")],
				path: "/ok",
			},
		},
		{
			id: "bridge-res-end-post-1kb",
			label: "bridge res.end (POST 1KB)",
			question: "What does the raw body-streaming path cost?",
			baseline: {
				label: "elysia-handler",
				cmd: ["bun", "run", join(SERVERS, "elysia-handler.ts")],
				path: "/ok",
				method: "POST",
				body: POST_BODY,
				contentType: "application/json",
			},
			typeway: {
				label: "bridge-direct",
				cmd: ["bun", "run", join(SERVERS, "bridge-direct.ts")],
				path: "/ok",
				method: "POST",
				body: POST_BODY,
				contentType: "application/json",
			},
		},
	];

	if (!macro) return scenarios;

	const standalone: Arm = {
		label: "tanstack-standalone",
		cmd: ["bun", "run", join(SERVERS, "tanstack-standalone.ts")],
		path: "/",
	};

	scenarios.push(
		{
			id: "tanstack-ssr",
			label: "TanStack SSR (GET /)",
			question: "What does hosting TanStack Start under Elysia cost vs standalone?",
			baseline: standalone,
			typeway: {
				label: "server.prod.ts (dist/app)",
				cmd: ["bun", "dist/app"],
				cwd: APP_DIR,
				path: "/",
			},
		},
		{
			id: "tanstack-ssr-unbundled",
			label: "TanStack SSR (unbundled server.prod.ts)",
			question:
				"Splits the tanstack-ssr delta in two: how much is Elysia hosting, and how much is the app's `bun build --target bun` re-bundling step? Same source as dist/app, just not bundled.",
			baseline: standalone,
			typeway: {
				label: "server.prod.ts (unbundled)",
				cmd: ["bun", "run", "server.prod.ts"],
				cwd: APP_DIR,
				path: "/",
			},
		},
		{
			id: "tanstack-static-asset",
			label: `static asset (GET ${assetPath})`,
			question: "What does our prod static-file path cost vs standalone?",
			baseline: { ...standalone, path: assetPath },
			typeway: {
				label: "server.prod.ts (dist/app)",
				cmd: ["bun", "dist/app"],
				cwd: APP_DIR,
				path: assetPath,
			},
		},
		{
			id: "tanstack-ssr-via-bridge",
			label: "TanStack SSR via connect() fallback",
			question:
				"Extra: what would SSR cost if prod routed through the bridge, as dev does? (server.prod.ts does NOT use connect())",
			baseline: standalone,
			typeway: {
				label: "tanstack-via-connect",
				cmd: ["bun", "run", join(SERVERS, "tanstack-via-connect.ts")],
				path: "/",
			},
		},
	);

	return scenarios;
}

// ------------------------------------------------------------ server driving

async function freePort(): Promise<number> {
	const server = Bun.serve({ port: 0, fetch: () => new Response("") });
	const port = server.port;
	await server.stop(true);
	return port;
}

interface Booted {
	proc: Bun.Subprocess;
	url: string;
	stop: () => Promise<void>;
}

async function boot(arm: Arm, timeoutMs = 30_000): Promise<Booted> {
	const port = await freePort();
	const proc = Bun.spawn(arm.cmd, {
		cwd: arm.cwd ?? REPO_DIR,
		env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
		stdout: "ignore",
		stderr: "pipe",
	});

	const url = `http://127.0.0.1:${port}${arm.path}`;
	const deadline = Date.now() + timeoutMs;

	const stop = async () => {
		proc.kill();
		await proc.exited;
	};

	while (Date.now() < deadline) {
		if (proc.exitCode !== null) {
			const stderr = await new Response(proc.stderr).text();
			throw new Error(`${arm.label} exited ${proc.exitCode} during boot:\n${stderr.trim()}`);
		}

		try {
			const response = await request(url, arm);
			await response.arrayBuffer();
			if (response.status >= 500) {
				throw new Error(`${arm.label} answered ${response.status} at ${arm.path}`);
			}
			return { proc, url, stop };
		} catch (error) {
			if (error instanceof Error && error.message.includes("answered")) {
				await stop();
				throw error;
			}
			await Bun.sleep(50);
		}
	}

	await stop();
	throw new Error(`${arm.label} did not become ready within ${timeoutMs}ms`);
}

function request(url: string, arm: Arm): Promise<Response> {
	return fetch(url, {
		method: arm.method ?? "GET",
		...(arm.body === undefined
			? {}
			: {
					body: arm.body,
					headers: arm.contentType ? { "content-type": arm.contentType } : {},
				}),
	});
}

// -------------------------------------------------------------------- stats

function medianSample(samples: LoadSample[]): LoadSample {
	// Pick the run whose RPS is the median, so latency/throughput stay from the
	// same observation rather than being averaged across different runs.
	const sorted = [...samples].sort((a, b) => a.rps - b.rps);
	return sorted[Math.floor((sorted.length - 1) / 2)];
}

function spread(values: number[]): number {
	if (values.length < 2) return 0;
	const min = Math.min(...values);
	const max = Math.max(...values);
	return min === 0 ? 0 : (max - min) / min;
}

// ------------------------------------------------------------------- output

function fmtRps(value: number): string {
	if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
	return value.toFixed(0);
}

function fmtMs(value: number): string {
	return value >= 10 ? `${value.toFixed(1)}ms` : `${value.toFixed(2)}ms`;
}

function pad(text: string, width: number, right = false): string {
	return right ? text.padStart(width) : text.padEnd(width);
}

interface ScenarioResult {
	id: string;
	label: string;
	question: string;
	claim?: string;
	baseline: ArmResult;
	typeway: ArmResult;
	ratio: number;
	deltaPercent: number;
	deltaMicrosPerRequest: number;
	runSpread: { baseline: number; typeway: number };
}

interface ArmResult {
	label: string;
	command: string;
	path: string;
	method: string;
	runs: LoadSample[];
	median: LoadSample;
}

function printTable(results: ScenarioResult[]): void {
	const header = [
		"scenario",
		"baseline RPS",
		"typeway RPS",
		"ratio",
		"p99 base",
		"p99 typeway",
		"Δ µs/req",
	];

	const rows = results.map((r) => [
		r.label,
		fmtRps(r.baseline.median.rps),
		fmtRps(r.typeway.median.rps),
		`${r.ratio.toFixed(3)}x`,
		fmtMs(r.baseline.median.p99Ms),
		fmtMs(r.typeway.median.p99Ms),
		`${r.deltaMicrosPerRequest >= 0 ? "+" : ""}${r.deltaMicrosPerRequest.toFixed(1)}`,
	]);

	const widths = header.map((h, i) =>
		Math.max(h.length, ...rows.map((row) => row[i].length)),
	);

	const line = (cells: string[]) =>
		cells.map((cell, i) => pad(cell, widths[i], i > 0)).join("   ");

	console.log("");
	console.log(line(header));
	console.log(widths.map((w) => "-".repeat(w)).join("   "));
	for (const row of rows) console.log(line(row));
	console.log("");
}

// --------------------------------------------------------------------- main

async function ensureBuild(options: Options): Promise<void> {
	const needed = [
		join(APP_DIR, "dist/app"),
		join(APP_DIR, "dist/server/server.js"),
		join(APP_DIR, "dist/client/assets"),
	];
	if (needed.every((path) => existsSync(path))) return;

	if (!options.build) {
		throw new Error(
			`apps/playground-with-tanstack/dist is missing or incomplete and --no-build was passed.\nRun: cd apps/playground-with-tanstack && bun run build`,
		);
	}

	console.log("dist/ missing — building apps/playground-with-tanstack (this takes a minute)...");
	const proc = Bun.spawn(["bun", "run", "build"], {
		cwd: APP_DIR,
		env: { ...process.env, NODE_ENV: "production" },
		stdout: "ignore",
		stderr: "pipe",
	});
	await proc.exited;
	if (proc.exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`TanStack build failed (${proc.exitCode}):\n${stderr.trim()}`);
	}
}

/** Smallest hashed .js asset — keeps scenario D dominated by per-request overhead rather than bandwidth. */
function findAsset(): { path: string; bytes: number } {
	const dir = join(APP_DIR, "dist/client/assets");
	const candidates = readdirSync(dir)
		.filter((name) => name.endsWith(".js"))
		.map((name) => ({ name, bytes: statSync(join(dir, name)).size }))
		.sort((a, b) => a.bytes - b.bytes);

	if (candidates.length === 0) throw new Error(`no .js assets found in ${dir}`);
	return { path: `/assets/${candidates[0].name}`, bytes: candidates[0].bytes };
}

async function readVersionAsync(packageJsonPath: string): Promise<string | null> {
	try {
		const json = await Bun.file(packageJsonPath).json();
		return json.version ?? null;
	} catch {
		return null;
	}
}

async function collectVersions() {
	return {
		bun: Bun.version,
		elysia: await readVersionAsync(
			join(REPO_DIR, "packages/connect/node_modules/elysia/package.json"),
		),
		"@typeway/connect": await readVersionAsync(join(REPO_DIR, "packages/connect/package.json")),
		"@tanstack/react-start": await readVersionAsync(
			join(APP_DIR, "node_modules/@tanstack/react-start/package.json"),
		),
		vite: await readVersionAsync(join(APP_DIR, "node_modules/vite/package.json")),
	};
}

async function smoke(scenarios: Scenario[]): Promise<void> {
	console.log("smoke: booting each arm and issuing a single request\n");
	for (const scenario of scenarios) {
		console.log(`${scenario.id}`);
		for (const arm of [scenario.baseline, scenario.typeway]) {
			const booted = await boot(arm);
			const response = await request(booted.url, arm);
			const body = await response.arrayBuffer();
			console.log(
				`  ${pad(arm.label, 26)} ${arm.method ?? "GET"} ${pad(arm.path, 28)} -> ${response.status} ${body.byteLength}B`,
			);
			await booted.stop();
		}
	}
	console.log("\nsmoke ok");
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));

	// ---- generator selection
	const ohaPath = await findOha();
	let generator: GeneratorName;

	if (options.generator === "oha") {
		if (!ohaPath) {
			console.error(OHA_INSTALL_HINT);
			process.exit(1);
		}
		generator = "oha";
	} else if (options.generator === "fallback") {
		generator = "fallback";
	} else if (ohaPath) {
		generator = "oha";
	} else {
		// oha is the primary path; make its absence loud, then keep going so the
		// suite still produces numbers.
		console.error(OHA_INSTALL_HINT);
		console.error("\n>>> falling back to the built-in Bun load generator <<<\n");
		generator = "fallback";
	}

	const generatorLabel =
		generator === "oha" && ohaPath
			? await ohaVersion(ohaPath)
			: "bun-fallback (built-in, generator-bound)";

	if (options.macro) await ensureBuild(options);

	const asset = options.macro ? findAsset() : { path: "/assets/none.js", bytes: 0 };
	let scenarios = buildScenarios(asset.path, options.macro);

	if (options.only) {
		const needle = options.only.toLowerCase();
		scenarios = scenarios.filter(
			(s) => s.id.toLowerCase().includes(needle) || s.label.toLowerCase().includes(needle),
		);
		if (scenarios.length === 0) throw new Error(`--only ${options.only} matched no scenarios`);
	}

	if (options.smoke) {
		await smoke(scenarios);
		return;
	}

	console.log(`generator:   ${generatorLabel}`);
	console.log(
		`methodology: ${options.runs} x ${options.durationSec}s @ c=${options.connections}, ${options.warmupSec}s warmup per boot, arms interleaved, median kept`,
	);
	if (options.macro) console.log(`static asset: ${asset.path} (${asset.bytes} B)`);
	console.log(`load average at start: ${os.loadavg().map((n) => n.toFixed(2)).join(" ")}`);
	console.log("");

	const results: ScenarioResult[] = [];

	for (const scenario of scenarios) {
		process.stdout.write(`${scenario.id} `);

		const samples: Record<"baseline" | "typeway", LoadSample[]> = {
			baseline: [],
			typeway: [],
		};

		for (let round = 0; round < options.runs; round++) {
			for (const side of ["baseline", "typeway"] as const) {
				const arm = scenario[side];
				const booted = await boot(arm);
				try {
					const target = {
						url: booted.url,
						method: arm.method,
						body: arm.body,
						contentType: arm.contentType,
					};

					if (options.warmupSec > 0) {
						await runLoad(target, {
							durationSec: options.warmupSec,
							connections: options.connections,
							generator,
							ohaPath: ohaPath ?? undefined,
						});
					}

					const sample = await runLoad(target, {
						durationSec: options.durationSec,
						connections: options.connections,
						generator,
						ohaPath: ohaPath ?? undefined,
					});

					if (sample.successRate < 0.99) {
						throw new Error(
							`${arm.label} success rate ${(sample.successRate * 100).toFixed(1)}% — results would be meaningless`,
						);
					}

					samples[side].push(sample);
					process.stdout.write(side === "baseline" ? "." : "o");
				} finally {
					await booted.stop();
				}
			}
		}

		const baselineMedian = medianSample(samples.baseline);
		const typewayMedian = medianSample(samples.typeway);
		const ratio = typewayMedian.rps / baselineMedian.rps;

		// Per-request cost difference in microseconds, derived from throughput:
		// at saturation, 1/RPS is the effective per-request service time.
		const deltaMicros =
			(1 / Math.max(typewayMedian.rps, 1e-9) - 1 / Math.max(baselineMedian.rps, 1e-9)) * 1e6;

		results.push({
			id: scenario.id,
			label: scenario.label,
			question: scenario.question,
			claim: scenario.claim,
			baseline: armResult(scenario.baseline, samples.baseline, baselineMedian),
			typeway: armResult(scenario.typeway, samples.typeway, typewayMedian),
			ratio,
			deltaPercent: (ratio - 1) * 100,
			deltaMicrosPerRequest: deltaMicros,
			runSpread: {
				baseline: spread(samples.baseline.map((s) => s.rps)),
				typeway: spread(samples.typeway.map((s) => s.rps)),
			},
		});

		process.stdout.write(" done\n");
	}

	printTable(results);

	for (const result of results) {
		if (!result.claim) continue;
		const held = Math.abs(result.deltaPercent) <= 2;
		console.log(
			`claim [${result.id}]: ${result.claim}\n  -> measured ${result.deltaPercent >= 0 ? "+" : ""}${result.deltaPercent.toFixed(2)}% — ${held ? "HOLDS" : "DOES NOT HOLD"}`,
		);
	}

	const worstSpread = Math.max(
		...results.flatMap((r) => [r.runSpread.baseline, r.runSpread.typeway]),
	);
	if (options.runs < 2) {
		console.log("\nrun-to-run spread: n/a (--runs 1)");
	} else {
		console.log(
			`\nrun-to-run spread (max across arms): ${(worstSpread * 100).toFixed(1)}%` +
				(worstSpread > 0.05
					? " — above the ~5% methodology sanity threshold; re-run on an idle machine"
					: " — within the ~5% methodology sanity threshold"),
		);
	}

	// ---- persist
	const cpu = os.cpus()[0]?.model ?? "unknown";
	const machineSlug = cpu
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	const date = new Date().toISOString().slice(0, 10);

	const outPath = options.out ?? join(BENCH_DIR, "results", `${date}-${machineSlug}.json`);
	await mkdir(dirname(outPath), { recursive: true });

	const payload = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		generator: {
			name: generator,
			version: generatorLabel,
			comparableAcrossGenerators: false,
		},
		methodology: {
			runsPerArm: options.runs,
			durationSec: options.durationSec,
			warmupSecPerBoot: options.warmupSec,
			connections: options.connections,
			armOrder: "interleaved per round (baseline, typeway, ...)",
			aggregate: "median run by RPS; latency taken from that same run",
			oneServerAtATime: true,
		},
		machine: {
			cpu,
			cores: os.cpus().length,
			arch: os.arch(),
			platform: os.platform(),
			release: os.release(),
			totalMemGB: Math.round(os.totalmem() / 1024 ** 3),
			loadAvgAtEnd: os.loadavg(),
		},
		versions: await collectVersions(),
		staticAsset: options.macro ? asset : null,
		note: options.note,
		results,
	};

	await Bun.write(outPath, `${JSON.stringify(payload, null, 2)}\n`);
	console.log(`\nwrote ${outPath.replace(`${REPO_DIR}/`, "")}`);
}

function armResult(arm: Arm, runs: LoadSample[], medianRun: LoadSample): ArmResult {
	return {
		label: arm.label,
		command: arm.cmd.join(" ").replace(`${REPO_DIR}/`, ""),
		path: arm.path,
		method: arm.method ?? "GET",
		runs,
		median: medianRun,
	};
}

await main();
