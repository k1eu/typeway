/**
 * In-process micro-benchmarks for the bridge internals — no HTTP, no sockets.
 *
 * `run.ts` measures end-to-end throughput, which bundles the bridge together
 * with Bun's HTTP stack and Elysia's router. This file isolates the pieces the
 * bridge actually adds, so a regression can be attributed to a specific one:
 *
 *   - `createBridgeRequest`  — web Request -> IncomingMessage-alike
 *   - `BridgeResponse`       — ServerResponse-alike -> web Response
 *   - full `handle()`        — the exact promise/chain machinery in src/index.ts
 *
 * `new Response("ok")` is included purely as a scale reference: it is the
 * cheapest thing any of these paths could possibly reduce to.
 *
 *   bun bench/micro.ts
 *
 * mitata is installed in bench/node_modules (see bench/README.md — bench/ is
 * intentionally not a workspace member).
 */

import { barplot, bench, run, summary } from "mitata";
import { runMiddlewares } from "../packages/connect/src/chain.ts";
import { createBridgeRequest } from "../packages/connect/src/request.ts";
import { BridgeResponse } from "../packages/connect/src/response.ts";
import type { ConnectMiddleware } from "../packages/connect/src/types.ts";

const URL_GET = "http://127.0.0.1/ok";
const BODY_1KB = JSON.stringify({ pad: "x".repeat(950) });

/**
 * Byte-for-byte the `handle()` closure from packages/connect/src/index.ts.
 * Kept in sync deliberately rather than exported from the package — the bench
 * must not change the shape of the code it is measuring.
 */
function handle(middlewares: ConnectMiddleware[], request: Request) {
	return new Promise<Response | BridgeResponse>((resolve, reject) => {
		const req = createBridgeRequest(request);
		const res = new BridgeResponse(resolve, reject);

		runMiddlewares(middlewares, req, res as never, (err) => {
			if (err) reject(err);
			else resolve(res);
		});
	});
}

const respondMiddleware: ConnectMiddleware = (_req, res) => {
	res.setHeader("content-type", "text/plain");
	res.end("ok");
};

const passthroughMiddleware: ConnectMiddleware = (_req, _res, next) => next();

// ------------------------------------------------------------------ request

summary(() => {
	barplot(() => {
		bench("baseline: new Request (GET)", () => new Request(URL_GET));

		bench("createBridgeRequest (GET)", () => createBridgeRequest(new Request(URL_GET)));

		bench("createBridgeRequest (GET, 5 headers + 3 query)", () =>
			createBridgeRequest(
				new Request(`${URL_GET}?a=1&b=2&c=3`, {
					headers: {
						accept: "*/*",
						"accept-encoding": "gzip",
						"user-agent": "bench",
						cookie: "sid=abc",
						"x-request-id": "1",
					},
				}),
			),
		);

		bench("createBridgeRequest (POST 1KB)", () =>
			createBridgeRequest(
				new Request(URL_GET, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: BODY_1KB,
				}),
			),
		);
	});
});

// ----------------------------------------------------------------- response

summary(() => {
	barplot(() => {
		bench("baseline: new Response('ok')", () => new Response("ok"));

		bench("BridgeResponse -> Response (end('ok'))", async () => {
			const promise = new Promise<Response>((resolve, reject) => {
				const res = new BridgeResponse(resolve, reject);
				res.setHeader("content-type", "text/plain");
				res.end("ok");
			});
			return await promise;
		});
	});
});

// -------------------------------------------------------------- round-trips

summary(() => {
	barplot(() => {
		bench("baseline: new Response('ok') from a Request", () => {
			const request = new Request(URL_GET);
			return new Response(request.method === "GET" ? "ok" : "no");
		});

		bench("handle(): GET -> res.end('ok')", () =>
			handle([respondMiddleware], new Request(URL_GET)),
		);

		bench("handle(): GET -> 3 middleware, last responds", () =>
			handle(
				[passthroughMiddleware, passthroughMiddleware, respondMiddleware],
				new Request(URL_GET),
			),
		);

		bench("handle(): GET -> all next() (fallback path)", () =>
			handle([passthroughMiddleware], new Request(URL_GET)),
		);

		bench("handle(): POST 1KB -> res.end('ok')", () =>
			handle(
				[respondMiddleware],
				new Request(URL_GET, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: BODY_1KB,
				}),
			),
		);
	});
});

await run();
