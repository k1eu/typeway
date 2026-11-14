import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Elysia } from "elysia";
import { typeway } from "./prod";
import { tanstack } from "./tanstack";

const dirs: string[] = [];

function clientDir() {
	const dir = mkdtempSync(join(tmpdir(), "typeway-server-"));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function ssr(body = "ssr") {
	return {
		fetch: () => new Response(body, { headers: { "x-handler": "ssr" } }),
	};
}

async function text(app: Elysia, path: string, method = "GET") {
	return app.handle(new Request(`http://server.test${path}`, { method }));
}

describe("typeway().prod + tanstack", () => {
	it("throws when the client dir is missing", async () => {
		const missing = join(tmpdir(), `typeway-server-missing-${Date.now()}`);
		await expect(
			typeway({
				app: new Elysia(),
				frontend: tanstack({ handler: ssr(), clientDir: missing }),
				serve: false,
			}).prod(),
		).rejects.toThrow(
			/Could not read .* — run `bun run build` before `bun run start`/,
		);
	});

	it("serves hashed assets from the client dir", async () => {
		const dir = clientDir();
		await Bun.write(join(dir, "assets", "app-abc.js"), "console.log(1)");

		const { app } = await typeway({
			app: new Elysia(),
			frontend: tanstack({ handler: ssr(), clientDir: dir }),
			serve: false,
		}).prod();
		const res = await text(app, "/assets/app-abc.js");

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("console.log(1)");
	});

	it("registers prerendered index.html at the clean URL and trailing slash", async () => {
		const dir = clientDir();
		const html = "<!doctype html><title>ssg</title>";
		await Bun.write(join(dir, "rendering", "ssg", "index.html"), html);

		const { app } = await typeway({
			app: new Elysia(),
			frontend: tanstack({ handler: ssr(), clientDir: dir }),
			serve: false,
		}).prod();

		for (const path of [
			"/rendering/ssg",
			"/rendering/ssg/",
			"/rendering/ssg/index.html",
		]) {
			const res = await text(app, path);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe(html);
		}
	});

	it("answers HEAD on a static route", async () => {
		const dir = clientDir();
		await Bun.write(join(dir, "pixel.png"), "png");

		const { app } = await typeway({
			app: new Elysia(),
			frontend: tanstack({ handler: ssr(), clientDir: dir }),
			serve: false,
		}).prod();
		const res = await text(app, "/pixel.png", "HEAD");

		expect(res.status).toBe(200);
	});

	it("falls through unknown paths to the SSR handler", async () => {
		const dir = clientDir();
		await Bun.write(join(dir, "assets", "app.js"), "ok");

		const { app } = await typeway({
			app: new Elysia(),
			frontend: tanstack({ handler: ssr("from-ssr"), clientDir: dir }),
			serve: false,
		}).prod();
		const res = await text(app, "/about");

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("from-ssr");
		expect(res.headers.get("x-handler")).toBe("ssr");
	});

	it("does not steal parent API routes for the mount", async () => {
		const dir = clientDir();
		await Bun.write(join(dir, "assets", "app.js"), "ok");

		const { app } = await typeway({
			app: new Elysia().get("/api/hello", () => ({
				message: "Hello world",
			})),
			frontend: tanstack({ handler: ssr(), clientDir: dir }),
			serve: false,
		}).prod();

		const api = await text(app, "/api/hello");
		expect(api.status).toBe(200);
		expect(await api.json()).toEqual({ message: "Hello world" });

		const page = await text(app, "/notes");
		expect(await page.text()).toBe("ssr");
	});

	it("registers a root index.html as / so a prerendered home stays static", async () => {
		const dir = clientDir();
		await Bun.write(join(dir, "index.html"), "<!doctype html>home");

		const { app } = await typeway({
			app: new Elysia(),
			frontend: tanstack({ handler: ssr(), clientDir: dir }),
			serve: false,
		}).prod();
		const res = await text(app, "/");

		expect(await res.text()).toBe("<!doctype html>home");
	});

	it("the prod barrel exposes .prod() and not .dev()", () => {
		const host = typeway({
			app: new Elysia(),
			frontend: tanstack({ handler: ssr() }),
			serve: false,
		});
		expect("prod" in host).toBe(true);
		expect("dev" in host).toBe(false);
	});

	it("bun build of the prod entry does not pull vite or rolldown", async () => {
		const dir = clientDir();
		const entry = join(dir, "boot.ts");
		const prod = new URL("./prod.ts", import.meta.url).pathname;
		const adapter = new URL("./tanstack.ts", import.meta.url).pathname;
		await Bun.write(
			entry,
			`import { typeway } from ${JSON.stringify(prod)};\nimport { tanstack } from ${JSON.stringify(adapter)};\nexport { typeway, tanstack };\n`,
		);

		const result = await Bun.build({
			entrypoints: [entry],
			outdir: dir,
			target: "bun",
		});
		expect(result.success).toBe(true);
		const bundle = await Bun.file(join(dir, "boot.js")).text();
		expect(bundle).not.toMatch(/createServer/);
		expect(bundle).not.toMatch(/rolldown/i);
	});
});
