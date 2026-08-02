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
 *
 * That mirroring is load-bearing for the `tanstack-static-asset` arm, so it has
 * to track `server.prod.ts`. When the app moved from a per-request
 * `Bun.file(...).exists()` probe to a boot-time manifest of `dist/client`, this
 * baseline moved with it. Leaving the old probe here would have charged the
 * baseline one filesystem stat per request that the typeway arm no longer pays —
 * i.e. it would have manufactured a win for the glue out of a change that has
 * nothing to do with Elysia.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../apps/playground-with-tanstack");
const CLIENT_DIR = join(APP_DIR, "dist/client");

const { default: handler } = await import(join(APP_DIR, "dist/server/server.js"));

// Same boot-time enumeration as `server.prod.ts`; this Map stands in for Elysia's
// static route table. It maps request pathname -> resolved file path so the
// per-request work matches the typeway arm, whose route closures each capture an
// already-joined path. An earlier version kept a Set of bare names and called
// `join()` on every request — syscall-free, but still a real handicap, and it
// showed up as a ~4% "win" for the glue on this arm.
const assets = new Map(
	(await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: CLIENT_DIR, onlyFiles: true }))).map(
		(file) => [`/${file}`, join(CLIENT_DIR, file)] as const,
	),
);

const port = Number(process.env.PORT ?? 3105);

Bun.serve({
	port,
	fetch(request) {
		const { pathname } = new URL(request.url);

		const asset = assets.get(pathname);
		if (asset !== undefined) return new Response(Bun.file(asset));

		return handler.fetch(request);
	},
});
