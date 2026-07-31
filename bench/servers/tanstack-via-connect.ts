/**
 * Extra arm (beyond plan 03's four scenarios) — TanStack SSR routed through
 * `connect()`'s `fallback`.
 *
 * The shipped `server.prod.ts` does NOT use `@typeway/connect` at all: in
 * production the app is plain Elysia with an `.all("*")` route, and the bridge
 * is only in the picture during development. That makes scenarios C/D a measure
 * of Elysia hosting, not of the bridge.
 *
 * This arm fills that gap: it is the *dev-mode shape* (middleware passes through
 * via `next()`, `fallback` renders SSR) with Vite removed, so the delta against
 * `tanstack-standalone.ts` is the bridge's cost on a realistic SSR payload.
 *
 * SSR (`/`) only — the middleware always calls `next()`, so static assets are
 * not served here.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "../../packages/connect/src/index.ts";
import { Elysia } from "../lib/elysia";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../apps/playground-with-tanstack");

const { default: handler } = await import(join(APP_DIR, "dist/server/server.js"));

const port = Number(process.env.PORT ?? 3106);

new Elysia()
	.use(
		connect((_req, _res, next) => next(), {
			fallback: (request) => handler.fetch(request),
		}),
	)
	.listen(port);
