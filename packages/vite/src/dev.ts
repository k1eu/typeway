import { connect, type ConnectMiddleware } from "@typeway/connect";
import { Elysia } from "elysia";
import {
	createServer,
	isRunnableDevEnvironment,
	type InlineConfig,
} from "vite";
import { DEFAULT_SSR_ENTRY } from "./defaults";

export type ViteDevOptions = {
	/**
	 * SSR module loaded through Vite's per-environment runner.
	 * Default: `./src/server.ts` — the name TanStack's Vite plugin already
	 * treats as the SSR build input.
	 */
	entry?: string;
	/**
	 * Extra Connect middleware run *before* Vite (e.g. test probes that
	 * must exercise the bridge rather than the SSR fallback).
	 */
	middleware?: ConnectMiddleware | ConnectMiddleware[];
	/**
	 * HMR websocket port. Vite opens this on its own port in middleware
	 * mode because upgrades cannot be forwarded through the bridge.
	 * Default: `HMR_PORT` env, or 24678.
	 */
	hmrPort?: number;
	/** Merged into `createServer()`. `middlewareMode` is always forced on. */
	vite?: InlineConfig;
};

/**
 * Dev host: Vite in `middlewareMode` through `@typeway/connect`, with
 * TanStack SSR in the fallback via the SSR environment's module runner.
 *
 * `ssrLoadModule` still works but is on Vite 8's `future` removal list
 * (with `transformRequest`, `moduleGraph`, `hot`). The runner is the
 * replacement; `isRunnableDevEnvironment` is the guard. `server.ws.port`
 * is the current HMR option — every transport field on `server.hmr` is
 * `@deprecated` and only silently shimmed until Vite removes it.
 */
export async function viteDev(options: ViteDevOptions = {}) {
	const entry = options.entry ?? DEFAULT_SSR_ENTRY;
	const hmrPort = options.hmrPort ?? Number(process.env.HMR_PORT ?? 24678);

	const viteDevServer = await createServer({
		...options.vite,
		server: {
			...options.vite?.server,
			middlewareMode: true,
			ws: {
				port: hmrPort,
				...options.vite?.server?.ws,
			},
		},
	});

	const ssrEnv = viteDevServer.environments.ssr;
	if (!isRunnableDevEnvironment(ssrEnv)) {
		throw new Error(
			"Vite's `ssr` environment is not runnable — cannot load the server entry.",
		);
	}

	const extra = options.middleware
		? Array.isArray(options.middleware)
			? options.middleware
			: [options.middleware]
		: [];

	return new Elysia({ name: "@typeway/vite" }).use(
		connect([...extra, viteDevServer.middlewares], {
			fallback: async (request) => {
				try {
					const { default: serverEntry } = await ssrEnv.runner.import(entry);
					return serverEntry.fetch(request);
				} catch (error) {
					if (error instanceof Error) viteDevServer.ssrFixStacktrace(error);
					console.error(error);
					return new Response("Internal Server Error", { status: 500 });
				}
			},
		}),
	);
}
