/**
 * A1 — baseline: plain Elysia with a registered `/json` route.
 *
 * Paired against `elysia-with-connect.ts`, which is byte-for-byte the same app
 * plus a mounted `connect()` plugin. The delta is the cost of having the bridge
 * present at all for traffic that never reaches it.
 */
import { Elysia } from "../lib/elysia";

const port = Number(process.env.PORT ?? 3101);

new Elysia().get("/json", () => ({ hello: "world" })).listen(port);
