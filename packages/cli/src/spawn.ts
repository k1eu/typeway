import { existsSync } from "node:fs";
import { join } from "node:path";
import { CliError } from "./errors";
import type { IO } from "./io";

export async function spawnInherit(
	io: IO,
	cmd: string[],
	env: Record<string, string | undefined>,
): Promise<number> {
	const proc = Bun.spawn(cmd, {
		cwd: io.cwd,
		env: { ...io.env, ...env },
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	return proc.exited;
}

export function requireFile(cwd: string, relative: string, code: string, message: string) {
	const path = join(cwd, relative);
	if (!existsSync(path)) {
		throw new CliError(code, message, { path: relative });
	}
	return path;
}
