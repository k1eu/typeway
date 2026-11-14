import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { CliError, EXIT } from "./errors";
import type { IO } from "./io";
import { printJson } from "./json";
import { applyWrites, planWrites, type PlannedWrite } from "./template";

const NAME_RE = /^[a-zA-Z0-9._-]+$/;

export function packageNameFromDir(dirName: string): string {
	const slug = dirName
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug.length > 0 ? slug : "typeway-app";
}

export function typewayDeps(workspace: boolean) {
	if (workspace) {
		return {
			server: "workspace:*",
			cli: "workspace:*",
		};
	}
	return {
		server: "0.1.0",
		cli: "0.1.0",
	};
}

function formatHumanWrites(writes: PlannedWrite[]) {
	return writes
		.map((w) => {
			const col = w.action.padEnd(6);
			return w.reason ? `${col} ${w.path}  (${w.reason})` : `${col} ${w.path}`;
		})
		.join("\n");
}

export async function runNew(
	io: IO,
	opts: {
		args: string[];
		json: boolean;
		dryRun: boolean;
		force: boolean;
		workspace: boolean;
	},
): Promise<number> {
	const raw = opts.args[0];
	if (!raw) {
		throw new CliError(
			"typeway.new.missing_name",
			"Usage: typeway new <dir>",
		);
	}
	if (opts.args.length > 1) {
		throw new CliError(
			"typeway.usage",
			`Unexpected extra arguments: ${opts.args.slice(1).join(" ")}`,
		);
	}

	const destDir = isAbsolute(raw) ? raw : resolve(io.cwd, raw);
	const dirName = basename(destDir);
	if (dirName === "." || dirName === ".." || !NAME_RE.test(dirName)) {
		throw new CliError(
			"typeway.new.invalid_name",
			`Invalid directory name "${dirName}". Use a single path segment like my-app.`,
			{ path: destDir },
		);
	}

	const name = packageNameFromDir(dirName);
	const exists = existsSync(destDir);
	if (exists) {
		const stat = statSync(destDir);
		if (!stat.isDirectory()) {
			throw new CliError(
				"typeway.new.exists",
				`${destDir} exists and is not a directory`,
				{ path: destDir },
			);
		}
		if (!opts.force && !opts.dryRun) {
			throw new CliError(
				"typeway.new.exists",
				`${destDir} already exists. Pass --force to overwrite Typeway files.`,
				{ path: destDir },
			);
		}
	}

	const deps = typewayDeps(opts.workspace);
	const vars = {
		name,
		typewayServer: deps.server,
		typewayCli: deps.cli,
	};

	const { writes, files } = planWrites(destDir, vars, { force: opts.force });

	if (opts.dryRun) {
		if (opts.json) {
			printJson(io, {
				ok: true,
				dryRun: true,
				dir: destDir,
				name,
				writes,
			});
		} else {
			io.stdout.write(`${formatHumanWrites(writes)}\n`);
		}
		return EXIT.ok;
	}

	try {
		applyWrites(destDir, files, writes);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CliError(
			"typeway.write_failed",
			`Failed to write ${destDir}: ${message}`,
			{ path: destDir, exitCode: EXIT.write },
		);
	}

	const relativeDir = destDir.startsWith(io.cwd)
		? destDir.slice(io.cwd.length).replace(/^\//, "") || "."
		: destDir;

	if (opts.json) {
		printJson(io, {
			ok: true,
			dryRun: false,
			dir: destDir,
			name,
			writes,
		});
	} else {
		io.stdout.write(`${formatHumanWrites(writes)}\n`);
		io.stdout.write(
			`\nCreated ${name} in ${relativeDir}. Next:\n  cd ${relativeDir === "." ? dirName : relativeDir}\n  bun install\n  bun run dev\n`,
		);
	}
	return EXIT.ok;
}

