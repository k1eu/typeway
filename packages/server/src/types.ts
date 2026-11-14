import type { ConnectMiddleware } from "@typeway/connect";
import type { Elysia } from "elysia";
import type { InlineConfig, ViteDevServer } from "vite";

export type { ConnectMiddleware };

/**
 * The host only calls `use` / `all` / `mount` / `fetch` / `listen`. Elysia's
 * route schema lives on the instance the caller already built — we do not
 * constrain it, so any configured `Elysia` is a `HostApp`.
 */
export type HostApp = Elysia<any, any, any, any, any, any, any, any>;

export type FetchHandler = {
	fetch(request: Request): Response | Promise<Response>;
};

export type ServeFn = (
	app: HostApp,
	port: number,
	onListen?: (info: { port: number }) => void,
) => unknown;

/**
 * A frontend that can be hosted under Elysia.
 *
 * The host creates the Vite dev server (and listens). The adapter wires
 * that frontend into `app` — `connect()` + SSR fallback in dev, statics +
 * `.mount()` in prod. `build` is layout, not a wrapper around `vite build`.
 */
export type FrontendAdapter = {
	name: string;
	/** Where this frontend writes its Vite/SSR build, relative to `distDir`. */
	build?: {
		entry?: string;
		client?: string;
		handler?: string;
	};
	dev(vite: ViteDevServer, app: HostApp): void | Promise<void>;
	prod(app: HostApp, distDir: string): void | Promise<void>;
};

export type TypewayOptions = {
	app: HostApp;
	frontend: FrontendAdapter;
	/** Default `Number(process.env.PORT ?? 3000)`. */
	port?: number;
	/** Default `./dist`. */
	distDir?: string;
	/**
	 * HMR websocket port. Default `Number(process.env.HMR_PORT ?? 24678)`.
	 * Set as `server.ws.port` (Vite 8); `server.hmr` transport fields are
	 * deprecated.
	 */
	hmrPort?: number;
	/** Merged into `createServer()`. `middlewareMode` is always forced on. */
	vite?: InlineConfig;
	/**
	 * How to bind the port. Default is `app.listen`. Pass a function for a
	 * custom `Bun.serve` (playground ALS). Pass `false` to wire the app and
	 * return without listening.
	 */
	serve?: ServeFn | false;
	onListen?: (info: { port: number }) => void;
};
