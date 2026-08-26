/**
 * TanStack's Vite plugin resolves the SSR build input by convention:
 * `src/server.{ts,tsx,...}` when it exists, otherwise the packaged default
 * entry. A differently-named file compiles to a different module in prod, so
 * anything added there works in dev and vanishes in the build.
 *
 * The built output keeps the input's basename, hence `dist/server/server.js`.
 * Prod boots must import that path with a *literal* specifier — `bun build
 * --target bun` has to see it statically to inline the SSR bundle. A variable
 * path would resolve against the bundle, which is the wrong base directory.
 */
export const DEFAULT_SSR_ENTRY = "./src/server.ts";

/** Client build output walked once at boot and registered as static routes. */
export const DEFAULT_CLIENT_DIR = "./dist/client";
