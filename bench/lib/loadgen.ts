/**
 * Load generator abstraction.
 *
 * Primary path is `oha` (multi-threaded Rust, HdrHistogram latencies). When it
 * is not installed we fall back to a Bun-based generator (`loadgen-worker.ts`)
 * so `bun bench/run.ts` still produces real numbers. The two are NOT
 * interchangeable in absolute terms — the fallback is a JS load generator and
 * will usually bottleneck before the server under test does. Every result set
 * records which generator produced it; only compare numbers from the same one.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export type GeneratorName = "oha" | "fallback";

export interface Target {
	url: string;
	method?: string;
	/** Request body (string). Sent with `contentType`. */
	body?: string;
	contentType?: string;
}

export interface LoadSample {
	rps: number;
	p50Ms: number;
	p99Ms: number;
	totalRequests: number;
	/** 0..1 */
	successRate: number;
	elapsedSec: number;
}

export interface LoadOptions {
	durationSec: number;
	connections: number;
	generator: GeneratorName;
	ohaPath?: string;
}

// ---------------------------------------------------------------- detection

/** Resolves the `oha` binary path, or null when it is not installed. */
export async function findOha(): Promise<string | null> {
	for (const candidate of ["oha", "/opt/homebrew/bin/oha", "/usr/local/bin/oha"]) {
		try {
			const proc = Bun.spawn([candidate, "--version"], {
				stdout: "ignore",
				stderr: "ignore",
			});
			await proc.exited;
			if (proc.exitCode === 0) return candidate;
		} catch {
			// not on PATH / not executable — try next
		}
	}
	return null;
}

export async function ohaVersion(ohaPath: string): Promise<string> {
	const proc = Bun.spawn([ohaPath, "--version"], { stdout: "pipe", stderr: "ignore" });
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	return out.trim() || "oha (unknown version)";
}

export const OHA_INSTALL_HINT = [
	"oha is not installed — it is the primary load generator for these benchmarks.",
	"",
	"  macOS:  brew install oha",
	"  cargo:  cargo install oha",
	"  more:   https://github.com/hatoo/oha",
	"",
	"Re-run once installed, or use the built-in Bun fallback generator:",
	"",
	"  bun bench/run.ts --generator fallback",
	"",
	"The fallback produces real, self-consistent A/B numbers but its absolute",
	"throughput is generator-bound and NOT comparable to oha numbers.",
].join("\n");

// ---------------------------------------------------------------------- run

export async function runLoad(target: Target, options: LoadOptions): Promise<LoadSample> {
	return options.generator === "oha"
		? runOha(target, options)
		: runFallback(target, options);
}

// ------------------------------------------------------------------ via oha

async function runOha(target: Target, options: LoadOptions): Promise<LoadSample> {
	const ohaPath = options.ohaPath ?? "oha";
	const args = [
		ohaPath,
		"--no-tui",
		// NOTE: oha >=1.x replaced the older `--json` flag with `--output-format json`.
		"--output-format",
		"json",
		"--no-color",
		"-z",
		`${options.durationSec}s`,
		"-c",
		String(options.connections),
		"-m",
		target.method ?? "GET",
	];

	if (target.body !== undefined) {
		args.push("-d", target.body);
		if (target.contentType) args.push("-T", target.contentType);
	}

	args.push(target.url);

	const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	await proc.exited;

	if (proc.exitCode !== 0) {
		throw new Error(`oha exited ${proc.exitCode}: ${stderr.trim() || stdout.trim()}`);
	}

	let parsed: OhaJson;
	try {
		parsed = JSON.parse(stdout) as OhaJson;
	} catch {
		throw new Error(`could not parse oha JSON output: ${stdout.slice(0, 400)}`);
	}

	const summary = parsed.summary ?? {};
	const percentiles = parsed.latencyPercentiles ?? {};

	// NOTE: `summary.total` is the elapsed wall time in SECONDS, not a request
	// count — the request count only exists in `statusCodeDistribution`.
	const byStatus = parsed.statusCodeDistribution ?? {};
	let completed = 0;
	let ok = 0;
	for (const [code, count] of Object.entries(byStatus)) {
		completed += count;
		if (Number(code) < 400) ok += count;
	}

	// Requests still in flight when the deadline hit ("aborted due to deadline")
	// plus any transport errors. Counted against the success rate so a server
	// that starts failing under load cannot silently produce a great-looking RPS.
	const errors = Object.values(parsed.errorDistribution ?? {}).reduce(
		(sum, count) => sum + count,
		0,
	);

	const attempted = completed + errors;

	// oha reports all durations in seconds.
	return {
		rps: num(summary.requestsPerSec),
		p50Ms: num(percentiles.p50) * 1000,
		p99Ms: num(percentiles.p99) * 1000,
		totalRequests: completed,
		successRate: attempted === 0 ? 0 : ok / attempted,
		elapsedSec: num(summary.total),
	};
}

interface OhaJson {
	summary?: {
		requestsPerSec?: number;
		/** Elapsed wall time in seconds — NOT a request count. */
		total?: number;
		successRate?: number;
	};
	latencyPercentiles?: Record<string, number>;
	statusCodeDistribution?: Record<string, number>;
	errorDistribution?: Record<string, number>;
}

function num(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// ------------------------------------------------------------- via fallback

/**
 * Bun-based generator. Spawns a small pool of worker processes so the load
 * generator is not competing with the orchestrator's event loop, then merges
 * their latency samples.
 */
async function runFallback(target: Target, options: LoadOptions): Promise<LoadSample> {
	const workerCount = Math.max(1, Math.min(4, options.connections));
	const perWorker = Math.max(1, Math.round(options.connections / workerCount));
	const workerScript = join(HERE, "loadgen-worker.ts");

	const started = Bun.nanoseconds();

	const procs = Array.from({ length: workerCount }, () =>
		Bun.spawn(["bun", "run", workerScript], {
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				BENCH_URL: target.url,
				BENCH_METHOD: target.method ?? "GET",
				BENCH_BODY: target.body ?? "",
				BENCH_HAS_BODY: target.body === undefined ? "0" : "1",
				BENCH_CONTENT_TYPE: target.contentType ?? "",
				BENCH_DURATION_MS: String(options.durationSec * 1000),
				BENCH_CONNECTIONS: String(perWorker),
			},
		}),
	);

	const results = await Promise.all(
		procs.map(async (proc) => {
			const [stdout, stderr] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
			]);
			await proc.exited;
			if (proc.exitCode !== 0) {
				throw new Error(`load worker exited ${proc.exitCode}: ${stderr.trim()}`);
			}
			return JSON.parse(stdout) as WorkerResult;
		}),
	);

	const wallSec = (Bun.nanoseconds() - started) / 1e9;

	const total = results.reduce((sum, r) => sum + r.count, 0);
	const ok = results.reduce((sum, r) => sum + r.ok, 0);
	// Each worker contributes an equal-stride sample of its own sorted latencies;
	// worker throughputs are near-identical, so merging the samples directly is a
	// close approximation of the global distribution.
	const merged = results.flatMap((r) => r.samples).sort((a, b) => a - b);

	// Use each worker's own measured send window rather than parent wall time,
	// which includes process spawn.
	const busiestSec = Math.max(...results.map((r) => r.elapsedSec), 1e-9);

	if (wallSec <= 0) throw new Error("fallback generator recorded a non-positive wall time");

	return {
		rps: total / busiestSec,
		p50Ms: percentile(merged, 0.5),
		p99Ms: percentile(merged, 0.99),
		totalRequests: total,
		successRate: total === 0 ? 0 : ok / total,
		elapsedSec: busiestSec,
	};
}

interface WorkerResult {
	count: number;
	ok: number;
	elapsedSec: number;
	samples: number[];
}

function percentile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
	return sorted[index];
}
