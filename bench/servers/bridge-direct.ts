/**
 * B2 — the honest per-request cost of the bridge.
 *
 * No routes are registered, so every request falls to `connect()`'s wildcard
 * and is served by Connect middleware: a full `createBridgeRequest` +
 * `BridgeResponse` + `runMiddlewares` round-trip per request.
 *
 * The response is made byte-equivalent to `elysia-handler.ts`'s ("ok" with
 * `content-type: text/plain`) so the pair differs only in machinery, not payload.
 *
 * The POST path drains the raw request stream before responding — this is the
 * body-streaming path (`Readable.fromWeb`), which is what the 1 KB POST
 * scenario measures.
 */
import { connect } from "../../packages/connect/src/index.ts";
import { Elysia } from "../lib/elysia";

const port = Number(process.env.PORT ?? 3104);

new Elysia()
	.use(
		connect((req, res, _next) => {
			res.setHeader("content-type", "text/plain");

			if (req.method === "GET" || req.method === "HEAD") {
				res.end("ok");
				return;
			}

			// Drain the raw body stream, then respond.
			req.on("data", () => {});
			req.on("end", () => res.end("ok"));
			req.on("error", () => res.end("ok"));
		}),
	)
	.listen(port);
