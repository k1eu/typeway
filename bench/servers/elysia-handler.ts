/**
 * A2 — baseline for the "what does a request cost when it goes *through* the
 * bridge" pair. Native Elysia handlers producing exactly the response that
 * `bridge-direct.ts` produces via `res.end("ok")`.
 *
 * The POST route uses `parse: "none"` so Elysia does not JSON-parse the body:
 * the bridge hands middleware a raw stream, so the fair baseline is one that
 * also just consumes raw bytes. (Elysia v2 takes the route config as the
 * *second* argument and the handler third.)
 */
import { Elysia } from "../lib/elysia";

const port = Number(process.env.PORT ?? 3103);

new Elysia()
	.get("/ok", () => "ok")
	.post("/ok", { parse: "none" }, async ({ request }) => {
		await request.arrayBuffer();
		return "ok";
	})
	.listen(port);
