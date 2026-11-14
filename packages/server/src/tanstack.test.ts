import { describe, expect, it } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Elysia } from "elysia";
import type { ViteDevServer } from "vite";
import { tanstack } from "./tanstack";

function ssr(body = "ssr") {
	return {
		fetch: () => new Response(body, { headers: { "x-handler": "ssr" } }),
	};
}

function fakeVite(options?: {
	fetch?: (request: Request) => Response | Promise<Response>;
	fail?: Error;
	ssrFixStacktrace?: (error: Error) => void;
	middleware?: (
		req: IncomingMessage,
		res: ServerResponse,
		next: (err?: unknown) => void,
	) => void;
}): ViteDevServer {
	const fetch = options?.fetch ?? (() => ssr().fetch());

	return {
		middlewares:
			options?.middleware ??
			((_req, _res, next: (err?: unknown) => void) => next()),
		environments: {
			ssr: {
				runner: {
					import: async () => {
						if (options?.fail) throw options.fail;
						return { default: { fetch } };
					},
				},
			},
		},
		ssrFixStacktrace: options?.ssrFixStacktrace ?? (() => {}),
	} as unknown as ViteDevServer;
}

describe("tanstack adapter", () => {
	it("names itself tanstack and publishes the src/server.ts layout", () => {
		const adapter = tanstack();
		expect(adapter.name).toBe("tanstack");
		expect(adapter.build).toEqual({
			entry: "./src/server.ts",
			client: "client",
			handler: "server/server.js",
		});
	});

	it("prod throws without a handler so the literal import stays in the app", async () => {
		const app = new Elysia();
		await expect(tanstack().prod(app, "./dist")).rejects.toThrow(
			/tanstack\(\{ handler \}\) is required in production/,
		);
	});

	it("dev fallback loads the SSR entry through the runner, not ssrLoadModule", async () => {
		const imported: string[] = [];
		const vite = fakeVite();
		const runner = vite.environments.ssr as unknown as {
			runner: { import: (id: string) => Promise<unknown> };
		};
		const original = runner.runner.import;
		runner.runner.import = async (id: string) => {
			imported.push(id);
			return original(id);
		};

		const app = new Elysia();
		await tanstack().dev(vite, app);
		const res = await app.handle(new Request("http://tanstack.test/about"));

		expect(imported).toEqual(["./src/server.ts"]);
		expect(await res.text()).toBe("ssr");
		expect((vite as { ssrLoadModule?: unknown }).ssrLoadModule).toBeUndefined();
	});

	it("dev extra middleware runs before Vite and can respond", async () => {
		const vite = fakeVite({
			fetch: () => new Response("ssr"),
		});
		const app = new Elysia();
		await tanstack({
			middleware: (req, res, next) => {
				const path = (req.url ?? "").split("?")[0];
				if (path === "/__probe") {
					res.writeHead(200, { "content-type": "text/plain" });
					res.end("probed");
					return;
				}
				next();
			},
		}).dev(vite, app);

		const probe = await app.handle(
			new Request("http://tanstack.test/__probe"),
		);
		expect(await probe.text()).toBe("probed");

		const page = await app.handle(new Request("http://tanstack.test/"));
		expect(await page.text()).toBe("ssr");
	});

	it("dev reports 500 and ssrFixStacktrace when the runner throws", async () => {
		const error = new Error("boom");
		const fixed: Error[] = [];
		const vite = fakeVite({
			fail: error,
			ssrFixStacktrace: (err) => {
				fixed.push(err);
			},
		});
		const errors: unknown[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => {
			errors.push(args[0]);
		};

		try {
			const app = new Elysia();
			await tanstack().dev(vite, app);
			const res = await app.handle(new Request("http://tanstack.test/"));
			expect(res.status).toBe(500);
			expect(await res.text()).toBe("Internal Server Error");
			expect(fixed).toEqual([error]);
			expect(errors).toEqual([error]);
		} finally {
			console.error = original;
		}
	});

	it("dev throws when the SSR environment has no runner", async () => {
		const vite = {
			middlewares: (_req: unknown, _res: unknown, next: () => void) => next(),
			environments: { ssr: {} },
			ssrFixStacktrace: () => {},
		} as unknown as ViteDevServer;

		await expect(tanstack().dev(vite, new Elysia())).rejects.toThrow(
			/ssr.*not runnable/i,
		);
	});
});
