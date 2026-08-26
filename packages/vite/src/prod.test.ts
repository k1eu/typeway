import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Elysia } from "elysia";
import { viteProd } from "./prod";

const dirs: string[] = [];

function clientDir() {
	const dir = mkdtempSync(join(tmpdir(), "typeway-vite-"));
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
	return app.handle(new Request(`http://vite.test${path}`, { method }));
}

describe("viteProd", () => {
	it("throws when the client dir is missing", async () => {
		const missing = join(tmpdir(), `typeway-vite-missing-${Date.now()}`);
		await expect(viteProd({ clientDir: missing, handler: ssr() })).rejects.toThrow(
			/Could not read .* — run `bun run build` before `bun run start`/,
		);
	});

	it("serves hashed assets from the client dir", async () => {
		const dir = clientDir();
		await Bun.write(join(dir, "assets", "app-abc.js"), "console.log(1)");

		const app = new Elysia().use(
			await viteProd({ clientDir: dir, handler: ssr() }),
		);
		const res = await text(app, "/assets/app-abc.js");

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("console.log(1)");
		expect(res.headers.get("content-type")).toContain("javascript");
	});

	it("registers prerendered index.html at the clean URL and trailing slash", async () => {
		const dir = clientDir();
		const html = "<!doctype html><title>ssg</title>";
		await Bun.write(join(dir, "rendering", "ssg", "index.html"), html);

		const app = new Elysia().use(
			await viteProd({ clientDir: dir, handler: ssr() }),
		);

		for (const path of [
			"/rendering/ssg",
			"/rendering/ssg/",
			"/rendering/ssg/index.html",
		]) {
			const res = await text(app, path);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe(html);
			expect(res.headers.get("content-type")).toContain("html");
		}
	});

	it("answers HEAD on a static route", async () => {
		const dir = clientDir();
		await Bun.write(join(dir, "pixel.png"), "png");

		const app = new Elysia().use(
			await viteProd({ clientDir: dir, handler: ssr() }),
		);
		const res = await text(app, "/pixel.png", "HEAD");

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("");
	});

	it("falls through unknown paths to the SSR handler", async () => {
		const dir = clientDir();
		await Bun.write(join(dir, "assets", "app.js"), "ok");

		const app = new Elysia().use(
			await viteProd({ clientDir: dir, handler: ssr("from-ssr") }),
		);
		const res = await text(app, "/about");

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("from-ssr");
		expect(res.headers.get("x-handler")).toBe("ssr");
	});

	it("does not steal parent API routes for the mount", async () => {
		const dir = clientDir();
		await Bun.write(join(dir, "assets", "app.js"), "ok");

		const app = new Elysia()
			.get("/api/hello", () => ({ message: "Hello world" }))
			.use(await viteProd({ clientDir: dir, handler: ssr() }));

		const api = await text(app, "/api/hello");
		expect(api.status).toBe(200);
		expect(await api.json()).toEqual({ message: "Hello world" });

		const page = await text(app, "/notes");
		expect(await page.text()).toBe("ssr");
	});

	it("registers a root index.html as / so a prerendered home stays static", async () => {
		const dir = clientDir();
		await Bun.write(join(dir, "index.html"), "<!doctype html>home");

		const app = new Elysia().use(
			await viteProd({ clientDir: dir, handler: ssr() }),
		);
		const res = await text(app, "/");

		expect(await res.text()).toBe("<!doctype html>home");
	});
});
