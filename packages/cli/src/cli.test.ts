import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgv } from "./argv";
import { run } from "./cli";
import type { IO } from "./io";
import { destName, listTemplateFiles } from "./template";

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
	const dir = mkdtempSync(join(tmpdir(), "typeway-cli-"));
	tmpDirs.push(dir);
	return dir;
}

describe("parseArgv", () => {
	test("command after global flags", () => {
		expect(parseArgv(["--json", "routes"])).toMatchObject({
			command: "routes",
			json: true,
			args: [],
		});
	});

	test("flags after the command", () => {
		expect(parseArgv(["new", "my-app", "--dry-run", "--json", "--force"])).toEqual({
			command: "new",
			json: true,
			dryRun: true,
			force: true,
			help: false,
			version: false,
			workspace: false,
			args: ["my-app"],
		});
	});

	test("unknown command", () => {
		expect(() => parseArgv(["generate"])).toThrow(/not implemented yet/);
		expect(() => parseArgv(["bogus"])).toThrow(/Unknown command/);
	});

	test("unknown flag", () => {
		expect(() => parseArgv(["routes", "--nope"])).toThrow(/Unknown flag/);
	});
});

describe("typeway --help", () => {
	test("human help lists commands", async () => {
		const cap = capture();
		expect(await run(["--help"], cap.io)).toBe(0);
		expect(cap.stdout()).toContain("new");
		expect(cap.stdout()).toContain("routes");
		expect(cap.stdout()).toContain("Commands:");
	});

	test("--json prints { ok, commands }", async () => {
		const cap = capture();
		expect(await run(["--help", "--json"], cap.io)).toBe(0);
		const body = JSON.parse(cap.stdout()) as {
			ok: boolean;
			commands: { name: string }[];
		};
		expect(body.ok).toBe(true);
		expect(body.commands.map((c) => c.name)).toEqual([
			"new",
			"dev",
			"build",
			"start",
			"routes",
			"help",
		]);
	});

	test("per-command help", async () => {
		const cap = capture();
		expect(await run(["new", "--help", "--json"], cap.io)).toBe(0);
		const body = JSON.parse(cap.stdout()) as { ok: boolean; command: { name: string } };
		expect(body.ok).toBe(true);
		expect(body.command.name).toBe("new");
	});
});

describe("errors", () => {
	test("unknown command --json", async () => {
		const cap = capture();
		expect(await run(["bogus", "--json"], cap.io)).toBe(1);
		const body = JSON.parse(cap.stdout()) as {
			ok: boolean;
			error: { code: string; docs: string };
		};
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe("typeway.unknown_command");
		expect(body.error.docs).toBe(
			"https://typeway.dev/errors/typeway.unknown_command",
		);
	});

	test("new without a dir", async () => {
		const cap = capture();
		expect(await run(["new", "--json"], cap.io)).toBe(1);
		const body = JSON.parse(cap.stdout()) as { error: { code: string } };
		expect(body.error.code).toBe("typeway.new.missing_name");
	});

	test("dev without server.dev.ts", async () => {
		const cap = capture(tmp());
		expect(await run(["dev", "--json"], cap.io)).toBe(1);
		const body = JSON.parse(cap.stdout()) as { error: { code: string; path?: string } };
		expect(body.error.code).toBe("typeway.dev.missing");
		expect(body.error.path).toBe("server.dev.ts");
	});

	test("start without dist/app", async () => {
		const cap = capture(tmp());
		expect(await run(["start", "--json"], cap.io)).toBe(1);
		const body = JSON.parse(cap.stdout()) as { error: { code: string } };
		expect(body.error.code).toBe("typeway.start.missing");
	});

	test("routes without server/app.ts", async () => {
		const cap = capture(tmp());
		expect(await run(["routes", "--json"], cap.io)).toBe(1);
		const body = JSON.parse(cap.stdout()) as { error: { code: string } };
		expect(body.error.code).toBe("typeway.routes.unreadable");
	});

	test("--dry-run is rejected on routes", async () => {
		const cap = capture();
		expect(await run(["routes", "--dry-run", "--json"], cap.io)).toBe(1);
		const body = JSON.parse(cap.stdout()) as { error: { code: string } };
		expect(body.error.code).toBe("typeway.usage");
	});
});

describe("typeway new --dry-run --json", () => {
	test("lists writes and creates nothing", async () => {
		const dir = tmp();
		const dest = join(dir, "my-app");
		const cap = capture(dir);
		expect(await run(["new", "my-app", "--dry-run", "--json"], cap.io)).toBe(0);
		const body = JSON.parse(cap.stdout()) as {
			ok: boolean;
			dryRun: boolean;
			name: string;
			writes: { action: string; path: string }[];
		};
		expect(body.ok).toBe(true);
		expect(body.dryRun).toBe(true);
		expect(body.name).toBe("my-app");
		const paths = body.writes.map((w) => w.path);
		expect(paths).toContain("server.dev.ts");
		expect(paths).toContain("server.prod.ts");
		expect(paths).toContain("src/server.ts");
		expect(paths).toContain("server/app.ts");
		expect(paths).toContain("AGENTS.md");
		expect(paths).toContain("app/context.ts");
		expect(body.writes.every((w) => w.action === "create")).toBe(true);
		expect(await Bun.file(dest).exists()).toBe(false);
	});

	test("refuses an existing directory unless --force", async () => {
		const dir = tmp();
		const dest = join(dir, "taken");
		await Bun.write(join(dest, "keep.txt"), "nope");
		const cap = capture(dir);
		expect(await run(["new", "taken", "--json"], cap.io)).toBe(1);
		expect(JSON.parse(cap.stdout()).error.code).toBe("typeway.new.exists");
		expect(readFileSync(join(dest, "keep.txt"), "utf8")).toBe("nope");
	});

	test("writes the canonical files", async () => {
		const dir = tmp();
		const cap = capture(dir);
		expect(await run(["new", "demo", "--json"], cap.io)).toBe(0);
		const dest = join(dir, "demo");
		for (const path of [
			"server.dev.ts",
			"src/server.ts",
			"server/app.ts",
			"app/context.ts",
			"AGENTS.md",
			"tests/integration.test.ts",
		]) {
			expect(await Bun.file(join(dest, path)).exists()).toBe(true);
		}
		const agents = readFileSync(join(dest, "AGENTS.md"), "utf8");
		expect(agents).toContain("<!-- typeway:conventions:start -->");
		expect(agents).toContain("<!-- typeway:conventions:end -->");
		const pkg = JSON.parse(readFileSync(join(dest, "package.json"), "utf8")) as {
			dependencies: Record<string, string>;
		};
		expect(pkg.dependencies["@typeway/server"]).toBe("0.1.0");
		const hello = readFileSync(join(dest, "src/routes/index.tsx"), "utf8");
		expect(hello).toContain("Welcome to demo");
		expect(hello).not.toContain("{{name}}");
	});

	test("--workspace writes workspace:* deps", async () => {
		const dir = tmp();
		const cap = capture(dir);
		expect(await run(["new", "ws", "--workspace", "--json"], cap.io)).toBe(0);
		const pkg = JSON.parse(
			readFileSync(join(dir, "ws", "package.json"), "utf8"),
		) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
		expect(pkg.dependencies["@typeway/server"]).toBe("workspace:*");
		expect(pkg.devDependencies.typeway).toBe("workspace:*");
	});
});

describe("templates", () => {
	test("every template maps to a dest path without .tmpl", () => {
		const files = listTemplateFiles().map((f) => destName(f));
		expect(files).toContain("src/server.ts");
		expect(files.every((f) => !f.endsWith(".tmpl"))).toBe(true);
		expect(files).toEqual([...files].sort());
	});
});
