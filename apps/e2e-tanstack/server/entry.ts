/**
 * The single TanStack Start server entry, named in one place so dev and prod
 * cannot drift apart.
 *
 * TanStack's Vite plugin resolves the SSR build input by convention: it uses
 * `src/server.{ts,tsx,...}` when it exists, and otherwise falls back to the
 * packaged default entry (`@tanstack/react-start/dist/plugin/default-entry/server.ts`).
 * Before this file existed, dev loaded `src/tanstack-server.ts` while the build
 * — finding no `src/server.ts` — compiled the *packaged* entry instead. The two
 * happened to behave identically, so nothing broke; but anything added to the
 * dev entry (request middleware, headers, request context) would have silently
 * vanished in production.
 *
 * `src/server.ts` is therefore the conventional name, not an arbitrary one: it
 * is what the build already looks for. The built output keeps the input's
 * basename, hence `dist/server/server.js`.
 *
 * If you ever set `tanstackStart({ server: { entry: ... } })`, update `SOURCE`
 * to match — or import Vite's `virtual:tanstack-start-server-entry` alias
 * instead, which follows that config automatically at the cost of depending on
 * an id the plugin does not publicly export.
 */

/** Dev: loaded through Vite's SSR module runner. */
export const SOURCE = "./src/server.ts";

/**
 * Prod loads the compiled output of `SOURCE` — `./dist/server/server.js` — but
 * imports it with a *literal* specifier in `server.prod.ts` rather than through
 * a constant here: `bun build --target bun` has to see the path statically to
 * inline the SSR bundle into `dist/app`. A variable specifier would defer to a
 * runtime resolve relative to the bundle, which is the wrong base directory.
 */
