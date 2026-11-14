import { assertNoDryRun, assertNoForce } from "./argv";
import type { IO } from "./io";
import { requireFile, spawnInherit } from "./spawn";

export async function runStart(
	io: IO,
	opts: { dryRun: boolean; force: boolean },
): Promise<number> {
	assertNoDryRun("start", opts.dryRun);
	assertNoForce("start", opts.force);
	requireFile(
		io.cwd,
		"dist/app",
		"typeway.start.missing",
		"dist/app is missing — run `typeway build` (or bun run build) first.",
	);
	return spawnInherit(io, ["bun", "dist/app"], {
		NODE_ENV: "production",
	});
}
