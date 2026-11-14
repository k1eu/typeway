import { afterAll, describe, expect, test } from "bun:test";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../cli";
import type { IO } from "../io";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");
const CLI = join(import.meta.dir, "..", "cli.ts");

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
	return { code: await proc.exited, stdout, stderr };
}

function walkFiles(dir: string): string[] {
	const out: string[] = [];
	function walk(current: string) {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else out.push(full);
		}
	}
	walk(dir);
	return out;
}

describe("typeway generate resource integration", () => {
	const workspace = mkdtempSync(join(tmpdir(), "typeway-gen-ws-"));
	const appDir = join(workspace, "app");

	afterAll(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	test(
		"typeway new then generate resource Post, tests, boots, and client-chunk guard",
		async () => {
			mkdirSync(join(workspace, "packages"));
			for (const pkg of ["cli", "server", "connect"]) {
				copyPackage(pkg, workspace);
			}
			writeFileSync(
				join(workspace, "package.json"),
				JSON.stringify(
					{
						name: "typeway-gen-fixture",
						private: true,
						workspaces: ["packages/*", "app"],
					},
					null,
					2,
				),
			);

			const created = await run(
				["new", "app", "--workspace", "--json"],
				capture(workspace).io,
			);
			expect(created).toBe(0);

			const install = await spawnLogged(["bun", "install"], workspace);
			expect(install.code).toBe(0);

			const gen = await spawnLogged(
				[
					"bun",
					CLI,
					"generate",
					"resource",
					"Post",
					"title:string",
					"body:text",
					"--json",
				],
				appDir,
			);
			if (gen.code !== 0) {
				throw new Error(
					`generate resource failed (${gen.code}):\n${gen.stdout}\n${gen.stderr}`,
				);
			}
			const genBody = JSON.parse(gen.stdout) as {
				ok: boolean;
				kind: string;
				name: string;
			};
			expect(genBody.ok).toBe(true);
			expect(genBody.kind).toBe("resource");
			expect(genBody.name).toBe("Post");

			const typecheck = await spawnLogged(["bun", "check"], appDir);
			if (typecheck.code !== 0) {
				throw new Error(`bun check failed:\n${typecheck.stdout}\n${typecheck.stderr}`);
			}

			const models = await spawnLogged(["bun", CLI, "models", "--json"], appDir);
			expect(models.code).toBe(0);
			expect(JSON.parse(models.stdout).models).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "Post", table: "posts" }),
				]),
			);

			const routes = await spawnLogged(["bun", CLI, "routes", "--json"], appDir);
			if (routes.code !== 0) {
				throw new Error(`routes --json failed:\n${routes.stdout}\n${routes.stderr}`);
			}
			const table = JSON.parse(routes.stdout) as {
				routes: { method: string; path: string; file: string | null }[];
			};
			const paths = table.routes.map((r) => `${r.method} ${r.path}`);
			expect(paths).toEqual(
				expect.arrayContaining([
					"GET /api/hello",
					"GET /api/posts/",
					"POST /api/posts/",
					"GET /api/posts/:id",
					"PATCH /api/posts/:id",
					"DELETE /api/posts/:id",
				]),
			);
			expect(
				table.routes.find((r) => r.method === "GET" && r.path.startsWith("/api/posts"))
					?.file,
			).toBe("server/routes/posts.ts");

			const frontend = await spawnLogged(["bun", "run", "build:frontend"], appDir, {
				NODE_ENV: "production",
			});
			if (frontend.code !== 0) {
				throw new Error(
					`build:frontend failed:\n${frontend.stdout}\n${frontend.stderr}`,
				);
			}
			const clientDir = join(appDir, "dist", "client");
			if (!existsSync(clientDir)) {
				throw new Error(
					`dist/client missing after build:frontend\n${frontend.stdout}\n${frontend.stderr}\nls: ${existsSync(join(appDir, "dist")) ? readdirSync(join(appDir, "dist")).join(", ") : "(no dist)"}`,
				);
			}
			for (const file of walkFiles(clientDir)) {
				if (!/\.(js|mjs|cjs)$/.test(file)) continue;
				const text = await Bun.file(file).text();
				expect(text).not.toContain("bun:sqlite");
				expect(text).not.toMatch(/\bdrizzle-orm\b/);
			}

			const portProc = Bun.listen({
				hostname: "127.0.0.1",
				port: 0,
				socket: { data() {} },
			});
			const port = portProc.port;
			portProc.stop(true);
			const hmr = Bun.listen({
				hostname: "127.0.0.1",
				port: 0,
				socket: { data() {} },
			});
			const hmrPort = hmr.port;
			hmr.stop(true);
			const url = `http://127.0.0.1:${port}`;
			const dbFile = join(workspace, "boot.sqlite");
			const logs: string[] = [];
			const server = Bun.spawn(["bun", "--bun", "run", "server.dev.ts"], {
				cwd: appDir,
				env: {
					...process.env,
					NODE_ENV: "development",
					PORT: String(port),
					HMR_PORT: String(hmrPort),
					DATABASE_URL: dbFile,
				},
				stdout: "pipe",
				stderr: "pipe",
			});
			const drain = async (stream: ReadableStream<Uint8Array>) => {
				try {
					for await (const chunk of stream) logs.push(new TextDecoder().decode(chunk));
				} catch {
					// closed
				}
			};
			void drain(server.stdout as ReadableStream<Uint8Array>);
			void drain(server.stderr as ReadableStream<Uint8Array>);

			const deadline = Date.now() + 90_000;
			let ready = false;
			while (Date.now() < deadline) {
				if (server.exitCode !== null) break;
				try {
					const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
					void res.body?.cancel();
					ready = true;
					break;
				} catch {
					await Bun.sleep(150);
				}
			}
			if (!ready) {
				server.kill("SIGKILL");
				throw new Error(`dev server did not boot\n${logs.join("")}`);
			}

			try {
				const createdPost = await fetch(`${url}/api/posts/`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ title: "Hello", body: "from generate" }),
				});
				expect(createdPost.status).toBe(200);
				const post = (await createdPost.json()) as { id: number; title: string };
				expect(post.title).toBe("Hello");

				const listed = await fetch(`${url}/api/posts/`);
				expect(listed.status).toBe(200);
				const rows = (await listed.json()) as { title: string }[];
				expect(rows.some((row) => row.title === "Hello")).toBe(true);

				const page = await fetch(`${url}/posts`);
				const html = await page.text();
				if (page.status !== 200) {
					throw new Error(
						`GET /posts → ${page.status}\n--- html ---\n${html.slice(0, 4000)}\n--- logs ---\n${logs.join("")}`,
					);
				}
				expect(html).toContain("<!DOCTYPE html");
				expect(html).toContain("Hello");
			} finally {
				server.kill();
				await server.exited;
			}
		},
		420_000,
	);
});
