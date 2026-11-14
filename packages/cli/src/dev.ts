import { assertNoDryRun, assertNoForce } from "./argv";
import type { IO } from "./io";
import { requireFile, spawnInherit } from "./spawn";

export async function runDev(
	io: IO,
	opts: { dryRun: boolean; force: boolean },
): Promise<number> {
	assertNoDryRun("dev", opts.dryRun);
	assertNoForce("dev", opts.force);
	requireFile(
		io.cwd,
		"server.dev.ts",
		"typeway.dev.missing",
		"server.dev.ts is missing — run this from a Typeway app (typeway new <dir>).",
	);
	return spawnInherit(
		io,
		["bun", "--bun", "--watch", "run", "server.dev.ts"],
		{ NODE_ENV: io.env.NODE_ENV ?? "development" },
	);
}
