import { afterAll, describe, expect, test } from "bun:test";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./cli";
import type { IO } from "./io";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const CLI = join(import.meta.dir, "cli.ts");

/** Copy a package tree without node_modules so the fixture install cannot
 *  rewrite the real workspace's links (a symlink would). */
function copyPackage(name: string, destRoot: string) {
	const src = join(REPO_ROOT, "packages", name);
	const dest = join(destRoot, "packages", name);
	function walk(from: string, to: string) {
		mkdirSync(to, { recursive: true });
		for (const entry of readdirSync(from, { withFileTypes: true })) {
			if (entry.name === "node_modules" || entry.name === "dist") continue;
			const nextFrom = join(from, entry.name);
			const nextTo = join(to, entry.name);
			if (entry.isDirectory()) walk(nextFrom, nextTo);
			else copyFileSync(nextFrom, nextTo);
		}
	}
	walk(src, dest);
}

function capture(cwd: string) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const io: IO = {
		cwd,
		env: { ...process.env },
		stdout: { write: (chunk) => stdout.push(chunk) },
		stderr: { write: (chunk) => stderr.push(chunk) },
	};
	return {
		io,
		stdout: () => stdout.join(""),
		stderr: () => stderr.join(""),
	};
}

async function spawnLogged(
	cmd: string[],
	cwd: string,
	env: Record<string, string> = {},
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
	const code = await proc.exited;
	return { code, stdout, stderr };
}

describe("typeway new integration", () => {
	const workspace = mkdtempSync(join(tmpdir(), "typeway-new-ws-"));
	const appDir = join(workspace, "app");

	afterAll(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	test(
		"scaffolds an app that typechecks, tests, and serves /api/hello + SSR",
		async () => {
			mkdirSync(join(workspace, "packages"));
			for (const pkg of ["cli", "server", "connect"]) {
				copyPackage(pkg, workspace);
			}
			writeFileSync(
				join(workspace, "package.json"),
				JSON.stringify(
					{
						name: "typeway-cli-fixture",
						private: true,
						workspaces: ["packages/*", "app"],
					},
					null,
					2,
				),
			);

			const cap = capture(workspace);
			const created = await run(["new", "app", "--workspace", "--json"], cap.io);
			expect(created).toBe(0);
			const body = JSON.parse(cap.stdout()) as { ok: boolean; writes: unknown[] };
			expect(body.ok).toBe(true);

			expect(await Bun.file(join(appDir, "server.dev.ts")).exists()).toBe(true);
			expect(await Bun.file(join(appDir, "src/server.ts")).exists()).toBe(true);

			const install = await spawnLogged(["bun", "install"], workspace);
			expect(install.code).toBe(0);

			const routes = await spawnLogged(["bun", CLI, "routes", "--json"], appDir);
			if (routes.code !== 0) {
				throw new Error(`routes --json failed:\n${routes.stdout}\n${routes.stderr}`);
			}
			const table = JSON.parse(routes.stdout) as {
				ok: boolean;
				routes: { method: string; path: string }[];
			};
			expect(table.ok).toBe(true);
			expect(table.routes).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ method: "GET", path: "/api/hello" }),
				]),
			);

			const typecheck = await spawnLogged(["bun", "check"], appDir);
			if (typecheck.code !== 0) {
				throw new Error(`bun check failed:\n${typecheck.stdout}\n${typecheck.stderr}`);
			}

			const tests = await spawnLogged(["bun", "test"], appDir);
			if (tests.code !== 0) {
				throw new Error(`bun test failed:\n${tests.stdout}\n${tests.stderr}`);
			}
		},
		360_000,
	);
});
