/**
 * B1 — same registered `/json` route as `elysia-plain.ts`, but with a
 * `connect()` plugin mounted alongside it.
 *
 * `connect()` registers a wildcard (`.all("*")`) route, and Elysia's router
 * gives the statically registered `/json` precedence — so requests to `/json`
 * should never touch the bridge. This pair is what tests that claim.
 */
import { connect } from "../../packages/connect/src/index.ts";
import { Elysia } from "../lib/elysia";

const port = Number(process.env.PORT ?? 3102);

new Elysia()
	.get("/json", () => ({ hello: "world" }))
	.use(
		connect((_req, _res, next) => next(), {
			fallback: () => new Response("nf", { status: 404 }),
		}),
	)
	.listen(port);
