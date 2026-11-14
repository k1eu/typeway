import { assertNoDryRun, assertNoForce } from "./argv";
import type { IO } from "./io";
import { requireFile, spawnInherit } from "./spawn";

export async function runBuild(
	io: IO,
	opts: { dryRun: boolean; force: boolean },
): Promise<number> {
	assertNoDryRun("build", opts.dryRun);
	assertNoForce("build", opts.force);
	requireFile(
		io.cwd,
		"server.prod.ts",
		"typeway.build.missing",
		"server.prod.ts is missing — run this from a Typeway app (typeway new <dir>).",
	);
	requireFile(
		io.cwd,
		"package.json",
		"typeway.build.missing",
		"package.json is missing — run this from a Typeway app.",
	);
	return spawnInherit(io, ["bun", "run", "build"], {
		NODE_ENV: "production",
	});
}
