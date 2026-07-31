import { describe, expect, it } from "bun:test";
import type { IncomingMessage } from "node:http";
import { Elysia } from "elysia";
import { connect } from "./index";

function readBody(req: IncomingMessage): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}

describe("connect middleware", () => {
	it("sets a header from middleware (falls through to 404)", async () => {
		const HEADER_NAME = "elysia-middlewares";
		const EXPECTED_VALUE = "connect";

		const app = new Elysia().use(
			connect((req, res, next) => {
				res.setHeader(HEADER_NAME, EXPECTED_VALUE);
				next();
			}),
		);

		const response = await app.handle(new Request("http://localhost/"));

		expect(response.status).toBe(404);
		expect(response.headers.get(HEADER_NAME)).toBe(EXPECTED_VALUE);
	});

	it("parses query params and responds from middleware", async () => {
		const EXPECTED_VALUE = "KRAVETSONE";

		const app = new Elysia().use(
			connect((req, res) => {
				res.end((req as never as { query: Record<string, string> }).query.value);
			}),
		);

		const response = await app.handle(
			new Request(`http://localhost/?value=${EXPECTED_VALUE}`),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe(EXPECTED_VALUE);
	});

	it("streams a JSON body to middleware", async () => {
		const EXPECTED_VALUE = "KRAVETSONE";

		const app = new Elysia().use(
			connect(async (req, res) => {
				const body = await readBody(req);
				res.setHeader("content-type", "application/json");
				res.end(body);
			}),
		);

		const response = await app.handle(
			new Request("http://localhost/", {
				method: "POST",
				body: JSON.stringify({ value: EXPECTED_VALUE }),
				headers: { "Content-Type": "application/json" },
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ value: EXPECTED_VALUE });
	});

	it("streams non-JSON bodies untouched (urlencoded)", async () => {
		const FORM = "name=typeway&kind=framework";

		const app = new Elysia().use(
			connect(async (req, res) => {
				const body = await readBody(req);
				res.end(body);
			}),
		);

		const response = await app.handle(
			new Request("http://localhost/", {
				method: "POST",
				body: FORM,
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe(FORM);
	});

	it("handles a request with no body", async () => {
		const app = new Elysia().use(
			connect(async (req, res) => {
				const body = await readBody(req);
				res.end(String(body.length));
			}),
		);

		const response = await app.handle(
			new Request("http://localhost/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("0");
	});

	it("round-trips binary responses byte-for-byte", async () => {
		const BYTES = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

		const app = new Elysia().use(
			connect((req, res) => {
				res.writeHead(200, { "content-type": "application/octet-stream" });
				res.end(BYTES);
			}),
		);

		const response = await app.handle(new Request("http://localhost/"));

		expect(response.status).toBe(200);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array(BYTES),
		);
	});

	it("preserves multiple Set-Cookie headers", async () => {
		const app = new Elysia().use(
			connect((req, res) => {
				res.setHeader("Set-Cookie", ["a=1; Path=/", "b=2; Path=/"]);
				res.end("ok");
			}),
		);

		const response = await app.handle(new Request("http://localhost/"));

		expect(response.headers.getSetCookie()).toEqual([
			"a=1; Path=/",
			"b=2; Path=/",
		]);
	});

	it("streams response chunks before the middleware finishes", async () => {
		let finish!: () => void;

		const app = new Elysia().use(
			connect((req, res) => {
				res.writeHead(200, { "content-type": "text/event-stream" });
				res.write("data: first\n\n");
				finish = () => {
					res.write("data: second\n\n");
					res.end();
				};
			}),
		);

		const response = await app.handle(new Request("http://localhost/"));
		const reader = response.body!.getReader();

		// first chunk must arrive while the middleware is still "open"
		const first = await reader.read();
		expect(new TextDecoder().decode(first.value)).toContain("data: first");

		finish();

		const second = await reader.read();
		expect(new TextDecoder().decode(second.value)).toContain("data: second");
		expect((await reader.read()).done).toBe(true);
	});

	it("supports empty-body statuses like 304", async () => {
		const app = new Elysia().use(
			connect((req, res) => {
				res.writeHead(304);
				res.end();
			}),
		);

		const response = await app.handle(new Request("http://localhost/"));

		expect(response.status).toBe(304);
		expect(response.body).toBeNull();
	});

	it("invokes the fallback when middleware passes through", async () => {
		const app = new Elysia().use(
			connect(
				(req, res, next) => {
					res.setHeader("x-from-middleware", "yes");
					next();
				},
				{
					fallback: (request) =>
						new Response(`ssr:${new URL(request.url).pathname}`),
				},
			),
		);

		const response = await app.handle(new Request("http://localhost/page"));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ssr:/page");
		expect(response.headers.get("x-from-middleware")).toBe("yes");
	});

	it("never runs middleware for registered routes", async () => {
		let middlewareCalls = 0;

		const app = new Elysia()
			.get("/api/hello", () => ({ ok: true }))
			.use(
				connect((req, res, next) => {
					middlewareCalls++;
					next();
				}),
			);

		const api = await app.handle(new Request("http://localhost/api/hello"));
		expect(api.status).toBe(200);
		expect(middlewareCalls).toBe(0);

		await app.handle(new Request("http://localhost/anything-else"));
		expect(middlewareCalls).toBe(1);
	});

	it("chains multiple middlewares in order", async () => {
		const app = new Elysia().use(
			connect([
				(req, res, next) => {
					res.setHeader("x-first", "1");
					next();
				},
				(req, res) => {
					res.end("second");
				},
			]),
		);

		const response = await app.handle(new Request("http://localhost/"));

		expect(await response.text()).toBe("second");
		expect(response.headers.get("x-first")).toBe("1");
	});
});
