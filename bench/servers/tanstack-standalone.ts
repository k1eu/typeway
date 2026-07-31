/**
 * C/D baseline — the TanStack Start app served WITHOUT any Typeway glue.
 *
 * `@tanstack/react-start`'s build emits `dist/server/server.js` exporting a
 * handler with a `.fetch(Request)` method, plus a `dist/client` asset tree. It
 * does not emit a runnable standalone bun/node server target, and `vite preview`
 * is a dev tool, not a production server — so (as the plan allows) the baseline
 * is that handler mounted on a bare `Bun.serve`.
 *
 * This file is deliberately a line-for-line mirror of the app's `server.prod.ts`
 * with Elysia removed, so the A/B delta is exactly "what Elysia hosting costs"
 * and not a difference in static-file strategy or route shape.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../apps/playground-with-tanstack");
const CLIENT_DIR = join(APP_DIR, "dist/client");

const { default: handler } = await import(join(APP_DIR, "dist/server/server.js"));

const port = Number(process.env.PORT ?? 3105);

Bun.serve({
	port,
	async fetch(request) {
		const { pathname } = new URL(request.url);

		if (pathname !== "/") {
			const asset = Bun.file(join(CLIENT_DIR, pathname));
			if (await asset.exists()) return new Response(asset);
		}

		return handler.fetch(request);
	},
});
