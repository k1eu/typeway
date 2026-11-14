import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../cli";
import type { IO } from "../io";

function capture(cwd = process.cwd()) {
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

const tmpDirs: string[] = [];

afterEach(() => {
	for (const dir of tmpDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function tmp() {
	const dir = mkdtempSync(join(tmpdir(), "typeway-gen-"));
	tmpDirs.push(dir);
	return dir;
}

async function scaffold(dir: string) {
	const cap = capture(dir);
	const code = await run(["new", "app", "--json"], cap.io);
	expect(code).toBe(0);
	return join(dir, "app");
}

describe("typeway generate --dry-run --json", () => {
	test("model lists writes and creates nothing", async () => {
		const app = await scaffold(tmp());
		const cap = capture(app);
		expect(
			await run(
				["generate", "model", "Post", "title:string", "body:text", "--dry-run", "--json"],
				cap.io,
			),
		).toBe(0);
		const body = JSON.parse(cap.stdout()) as {
			ok: boolean;
			dryRun: boolean;
			kind: string;
			writes: { action: string; path: string }[];
		};
		expect(body.ok).toBe(true);
		expect(body.dryRun).toBe(true);
		expect(body.kind).toBe("model");
		const paths = body.writes.map((w) => w.path);
		expect(paths).toContain("db/schema/posts.ts");
		expect(paths).toContain("app/models/post.ts");
		expect(paths).toContain("app/models/post.test.ts");
		expect(paths).toContain("app/schemas/post.ts");
		expect(paths).toContain("db/factories/post.ts");
		expect(paths).toContain("db/schema/index.ts");
		expect(paths).toContain("db/schema/relations.ts");
		expect(paths).toContain("AGENTS.md");
		expect(paths).toContain(".typeway/generate.json");
		expect(paths.some((p) => /db\/migrations\/\d{14}_create_posts\/migration\.sql/.test(p))).toBe(
			true,
		);
		expect(await Bun.file(join(app, "db/schema/posts.ts")).exists()).toBe(false);
	});

	test("resource includes routes and pages", async () => {
		const app = await scaffold(tmp());
		const cap = capture(app);
		expect(
			await run(
				["generate", "resource", "Post", "title:string", "body:text", "--dry-run", "--json"],
				cap.io,
			),
		).toBe(0);
		const body = JSON.parse(cap.stdout()) as {
			writes: { path: string }[];
		};
		const paths = body.writes.map((w) => w.path);
		expect(paths).toContain("server/routes/posts.ts");
		expect(paths).toContain("server/routes/posts.test.ts");
		expect(paths).toContain("src/routes/posts/index.tsx");
		expect(paths).toContain("src/routes/posts/$id.tsx");
		expect(paths).toContain("src/routes/posts/new.tsx");
		expect(paths).toContain("src/routes/posts/$id.edit.tsx");
		expect(paths).toContain("server/app.ts");
		expect(paths).toContain("app/errors.ts");
	});
});

describe("typeway generate into a skeleton", () => {
	test("writes files, second run skips, models --json is exact", async () => {
		const app = await scaffold(tmp());
		const first = capture(app);
		expect(
			await run(
				[
					"generate",
					"resource",
					"Post",
					"title:string",
					"body:text",
					"--skip-test",
					"--json",
				],
				first.io,
			),
		).toBe(0);
		const created = JSON.parse(first.stdout()) as {
			ok: boolean;
			writes: { action: string; path: string }[];
		};
		expect(created.ok).toBe(true);
		expect(created.writes.some((w) => w.action === "create")).toBe(true);

		for (const path of [
			"db/schema/posts.ts",
			"app/models/post.ts",
			"app/schemas/post.ts",
			"server/routes/posts.ts",
			"src/routes/posts/index.tsx",
			".typeway/generate.json",
		]) {
			expect(await Bun.file(join(app, path)).exists()).toBe(true);
		}

		const appTs = readFileSync(join(app, "server/app.ts"), "utf8");
		expect(appTs).toContain(".use(postsApi)");
		expect(appTs.match(/\.use\(postsApi\)/g)?.length).toBe(1);
		const index = readFileSync(join(app, "db/schema/index.ts"), "utf8");
		expect(index).toContain('export * from "./posts"');
		expect(index.match(/export \* from "\.\/posts"/g)?.length).toBe(1);
		const agents = readFileSync(join(app, "AGENTS.md"), "utf8");
		expect(agents).toContain("Post →");
		expect(agents).toContain("/api/posts");

		const second = capture(app);
		expect(
			await run(
				[
					"generate",
					"resource",
					"Post",
					"title:string",
					"body:text",
					"--skip-test",
					"--json",
				],
				second.io,
			),
		).toBe(0);
		const again = JSON.parse(second.stdout()) as {
			writes: { action: string; path: string; reason?: string }[];
		};
		const fileWrites = again.writes.filter((w) =>
			[
				"db/schema/posts.ts",
				"app/models/post.ts",
				"server/routes/posts.ts",
				"src/routes/posts/index.tsx",
			].includes(w.path),
		);
		expect(fileWrites.every((w) => w.action === "skip")).toBe(true);
		const appTsAgain = readFileSync(join(app, "server/app.ts"), "utf8");
		expect(appTsAgain.match(/\.use\(postsApi\)/g)?.length).toBe(1);

		const models = capture(app);
		expect(await run(["models", "--json"], models.io)).toBe(0);
		const table = JSON.parse(models.stdout()) as {
			ok: boolean;
			models: { name: string; table: string; file: string }[];
		};
		expect(table.ok).toBe(true);
		expect(table.models).toEqual([
			expect.objectContaining({
				name: "Post",
				table: "posts",
				file: "app/models/post.ts",
			}),
		]);
	});

	test("refuses an invalid name", async () => {
		const app = await scaffold(tmp());
		const cap = capture(app);
		expect(await run(["generate", "model", "123nope", "--json"], cap.io)).toBe(1);
		expect(JSON.parse(cap.stdout()).error.code).toBe("typeway.generate.invalid_name");
	});
});
