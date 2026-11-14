import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ParsedArgv } from "../argv";
import { CliError, EXIT } from "../errors";
import type { IO } from "../io";
import { printJson } from "../json";
import { applyWrites, formatHumanWrites } from "../template";
import { parseFields } from "./fields";
import { parseResourceName } from "./names";
import { planGenerate, type GenerateKind } from "./plan";

export { parseFields } from "./fields";
export { parseResourceName } from "./names";
export { planGenerate } from "./plan";

function parseKind(raw: string | undefined): GenerateKind {
	if (raw === "model" || raw === "resource") return raw;
	throw new CliError(
		"typeway.generate.missing_kind",
		'Usage: typeway generate model|resource <Name> [field:type ...]',
	);
}

async function spawnCaptured(
	cwd: string,
	cmd: string[],
	env: Record<string, string | undefined>,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(cmd, {
		cwd,
		env: { ...process.env, ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
		new Response(proc.stderr as ReadableStream<Uint8Array>).text(),
	]);
	return { code: await proc.exited, stdout, stderr };
}

async function generateRoutes(cwd: string): Promise<{ ran: boolean; output: string }> {
	if (!existsSync(join(cwd, "node_modules/@tanstack/router-cli"))) {
		return { ran: false, output: "" };
	}
	const result = await spawnCaptured(cwd, ["bun", "run", "generate-routes"], {
		NODE_ENV: process.env.NODE_ENV,
	});
	return {
		ran: true,
		output: `${result.stdout}${result.stderr}`,
	};
}

async function runGeneratedTests(
	cwd: string,
	files: string[],
): Promise<{ code: number; output: string }> {
	const result = await spawnCaptured(cwd, ["bun", "test", ...files], {
		NODE_ENV: "test",
	});
	return { code: result.code, output: `${result.stdout}${result.stderr}` };
}

export async function runGenerate(io: IO, parsed: ParsedArgv): Promise<number> {
	const kind = parseKind(parsed.args[0]);
	const names = parseResourceName(parsed.args[1] ?? "", parsed.plural);
	const fields = parseFields(parsed.args.slice(2));

	const planned = planGenerate(io.cwd, {
		kind,
		names,
		fields,
		now: new Date(),
		force: parsed.force,
		writeAgents: parsed.writeAgents,
	});

	if (parsed.dryRun) {
		if (parsed.json) {
			printJson(io, {
				ok: true,
				dryRun: true,
				kind,
				name: names.singularPascal,
				plural: names.pluralKebab,
				writes: planned.writes,
			});
		} else {
			io.stdout.write(`${formatHumanWrites(planned.writes)}\n`);
		}
		return EXIT.ok;
	}

	try {
		applyWrites(io.cwd, planned.files, planned.writes);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CliError(
			"typeway.write_failed",
			`Failed to write generated files: ${message}`,
			{ exitCode: EXIT.write },
		);
	}

	if (kind === "resource") {
		const routes = await generateRoutes(io.cwd);
		if (routes.ran && routes.output && !parsed.json) {
			io.stderr.write(routes.output);
		}
	}

	let tests: { ok: boolean; files: string[]; output?: string } | undefined;
	if (!parsed.skipTest) {
		const result = await runGeneratedTests(io.cwd, planned.testFiles);
		tests = {
			ok: result.code === 0,
			files: planned.testFiles,
			output: result.output,
		};
		if (result.code !== 0) {
			if (parsed.json) {
				printJson(io, {
					ok: false,
					error: {
						code: "typeway.generate.test_failed",
						message: `Generated tests failed: ${planned.testFiles.join(" ")}`,
						docs: "https://typeway.dev/errors/typeway.generate.test_failed",
					},
					writes: planned.writes,
					tests,
				});
			} else {
				io.stdout.write(`${formatHumanWrites(planned.writes)}\n`);
				io.stderr.write(result.output);
				io.stderr.write(
					`error: typeway.generate.test_failed: generated tests failed. Files were left in place.\n`,
				);
			}
			return EXIT.testFailed;
		}
		if (!parsed.json) {
			io.stderr.write(result.output);
		}
	}

	if (parsed.json) {
		printJson(io, {
			ok: true,
			dryRun: false,
			kind,
			name: names.singularPascal,
			plural: names.pluralKebab,
			writes: planned.writes,
			tests,
		});
	} else {
		io.stdout.write(`${formatHumanWrites(planned.writes)}\n`);
		io.stdout.write(
			`\nGenerated ${kind} ${names.singularPascal}. After editing the table, run bun run db:generate.\n`,
		);
	}
	return EXIT.ok;
}
