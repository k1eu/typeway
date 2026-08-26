/**
 * Safe to import from a `bun build --target bun` prod boot file.
 *
 * `viteDev` lives at `@typeway/vite/dev` and is *not* re-exported here:
 * `dev.ts` imports `vite`, and a barrel re-export would pull Vite (and
 * rolldown's native bindings) into `dist/app`.
 */
export { DEFAULT_CLIENT_DIR, DEFAULT_SSR_ENTRY } from "./defaults";
export { viteProd, type FetchHandler, type ViteProdOptions } from "./prod";
