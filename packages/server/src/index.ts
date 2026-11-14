/**
 * Safe to import from a `bun build --target bun` prod boot file.
 *
 * `typeway().dev()` lives at `@typeway/server/dev` and is *not* re-exported
 * here: `dev.ts` imports `vite`, and a barrel re-export would pull Vite (and
 * rolldown's native bindings) into `dist/app`.
 */
export {
	DEFAULT_CLIENT_DIR,
	DEFAULT_DIST_DIR,
	DEFAULT_SSR_ENTRY,
} from "./defaults";
export { typeway } from "./prod";
export { serveClientAssets, staticRoutesFor } from "./static";
export { tanstack, type TanStackOptions } from "./tanstack";
export type {
	FetchHandler,
	FrontendAdapter,
	HostApp,
	ServeFn,
	TypewayOptions,
} from "./types";
