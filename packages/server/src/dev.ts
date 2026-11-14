/**
 * Dev entry — the only module in this package that imports `vite`.
 *
 * Importing `typeway` from `@typeway/server` (the prod barrel) and calling
 * `.dev()` is impossible: that barrel does not re-export this file. A barrel
 * re-export here would pull Vite and rolldown's native bindings into the
 * prod `bun build` of `dist/app`, which then crashes at boot.
 */
import { createServer, type InlineConfig, type ViteDevServer } from "vite";
import { maybeListen } from "./host";
import { tanstack } from "./tanstack";
import type { HostApp, TypewayOptions } from "./types";

export type {
	FetchHandler,
	FrontendAdapter,
	HostApp,
	ServeFn,
	TypewayOptions,
} from "./types";
export type { TanStackOptions } from "./tanstack";
export { tanstack };
export {
	DEFAULT_CLIENT_DIR,
	DEFAULT_DIST_DIR,
	DEFAULT_SSR_ENTRY,
} from "./defaults";

export type DevResult = { app: HostApp; vite: ViteDevServer };

async function createVite(options: TypewayOptions): Promise<ViteDevServer> {
	const hmrPort = options.hmrPort ?? Number(process.env.HMR_PORT ?? 24678);
	const extra: InlineConfig = options.vite ?? {};

	return createServer({
		...extra,
		server: {
			...extra.server,
			middlewareMode: true,
			ws: {
				port: hmrPort,
				...extra.server?.ws,
			},
		},
	});
}

export function typeway(options: TypewayOptions) {
	return {
		async dev(): Promise<DevResult> {
			const vite = await createVite(options);
			await options.frontend.dev(vite, options.app);
			maybeListen(options.app, options, "development");
			return { app: options.app, vite };
		},
	};
}
