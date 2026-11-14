# 04 — Extract `@typeway/server`

The two TanStack apps copy the same Elysia hosting glue: Vite
`middlewareMode` through `@typeway/connect` in dev, a boot-time `dist/client`
manifest plus `.mount()` in prod. This plan pulls that glue into a workspace
package so an app server is `typeway({ app, frontend: tanstack() })` plus
`dev` / `build` / `start` entry points.

Plans 01–03 (smoke, feature coverage, benches) stay the contract. This package
must not change those HTTP behaviours.

## Name: `@typeway/server`, not `@typeway/vite`

The root README previously called this `@typeway/vite`. An earlier attempt
(PR #14, still open against `main`) shipped under that name.

**`@typeway/server` is the right name:**

- Production does not use Vite. It is Elysia static routes + `.mount()` of a
  fetch-native handler. Naming the package after Vite describes only the
  slower of the two modes.
- The public function is `typeway({ app, frontend })` — the HTTP host, not a
  Vite wrapper.
- Vite stays an implementation detail of `.dev()` (and of whatever frontend
  adapter needs a bundler). A later Solid / Nuxt adapter should not live under
  `@typeway/vite`.

PR #14's *lessons* still apply and are load-bearing here. We are not copying
its `viteDev()` / `viteProd()` plugin API; we are keeping the split-entry and
literal-handler constraints it discovered.

## Constraints inherited from PR #14 and the current apps

1. **Split the Vite import out of the prod graph.** `dev.ts` imports `vite`.
   A barrel that re-exports `.dev()` pulls Vite *and* rolldown's native
   bindings into `bun build --target bun --outfile dist/app`. That bundle then
   crashes at boot. `@typeway/server` (prod) must not re-export
   `@typeway/server/dev`. A unit test `bun build`s a prod boot file and
   asserts the bundle mentions neither `createServer` nor `rolldown`.
2. **The prod handler import stays a literal in the app.**
   `await import("./dist/server/server.js")` must be a string the bundler can
   see, so it inlines the Vite SSR output into `dist/app`. A variable path
   (or an import inside the package) resolves against the bundle, which is
   the wrong base directory. `tanstack({ handler })` takes the already-loaded
   module; the package never imports it.
3. **`src/server.ts` is the SSR entry name.** TanStack's Vite plugin uses
   that convention as the SSR build input and silently falls back to its
   packaged default when the file is missing. `apps/e2e-tanstack`'s `/__entry`
   route is the guard that the same module runs in both modes. Do not rename
   it, and do not load a different file in dev.
4. **Playground listen is not `app.listen()`.** Notes/auth share SQLite
   through AsyncLocalStorage, entered in `server/listen.ts` via `Bun.serve`.
   The host must accept a `serve` function so that wrapper stays in the app.
5. **e2e bridge probes are Connect middleware**, mounted *ahead* of Vite, and
   only in dev. They are not a frontend concern of TanStack's; they are extra
   middleware the adapter runs before `vite.middlewares`.

## API

```ts
// server.dev.ts
import { typeway, tanstack } from "@typeway/server/dev";
import { Elysia } from "elysia";
import { backend } from "./server/app";

await typeway({
  app: new Elysia().use(backend),
  frontend: tanstack(),
}).dev();

// server.prod.ts
import { typeway, tanstack } from "@typeway/server";
import { Elysia } from "elysia";
import { backend } from "./server/app";

// Specifier must stay literal — bun build --target bun inlines it.
// @ts-ignore built output only exists after `bun run build`
const { default: handler } = await import("./dist/server/server.js");

await typeway({
  app: new Elysia().use(backend),
  frontend: tanstack({ handler }),
}).prod();
```

Playground passes `serve: listen` (ALS). e2e passes
`tanstack({ middleware: devBridgeProbes })` in dev. `PORT` / `HMR_PORT` are
read from the environment when not overridden.

### Frontend adapter

```ts
type FrontendAdapter = {
  name: string;
  build?: { entry?: string; client?: string; handler?: string };
  dev(vite: ViteDevServer, app: Elysia): void | Promise<void>;
  prod(app: Elysia, distDir: string): void | Promise<void>;
};
```

The host owns Vite `createServer` (dev only), `PORT`, listen/serve, and
passing `distDir` into `prod`. The adapter owns how that frontend talks to
Elysia. `tanstack()` is the first implementation; a second frontend later
is a new function that returns the same shape, not a fork of the host.

`build` is layout, not a wrapper around `vite build`. Apps keep
`bun --bun vite build` + `bun build --target bun --outfile dist/app`
as the `build` / `start` scripts — Vite's CLI is already the right tool,
and the prod handler import has to live in the app file the bundler sees.

### `tanstack(options?)`

- `entry?: string` — default `./src/server.ts`.
- `handler?: { fetch(request): Response | Promise<Response> }` — **required
  in prod**.
- `middleware?: ConnectMiddleware | ConnectMiddleware[]` — extra Connect
  middleware before Vite (e2e probes).
- `clientDir?: string` — default `<distDir>/client`.

**dev:** `connect([middleware, vite.middlewares], { fallback })`. Fallback
loads `entry` with `vite.environments.ssr.runner.import` (guarded by a
runnable-SSR check; not `ssrLoadModule`), `ssrFixStacktrace` on errors, 500
otherwise.

**prod:** boot-time `Bun.Glob` of the client dir as `.all()` routes,
including clean URLs for `*/index.html` (`/rendering/ssg` and
`/rendering/ssg/`), then `.mount(handler.fetch)`. Missing client dir fails
at boot.

### Host options

- `app` — the Elysia instance (already `.use(backend)` / auth / …).
- `frontend` — an adapter.
- `port?` — default `Number(process.env.PORT ?? 3000)`.
- `distDir?` — default `./dist`.
- `hmrPort?` — default `Number(process.env.HMR_PORT ?? 24678)`, set as
  `server.ws.port`.
- `vite?` — merged into `createServer()`; `middlewareMode` always on.
- `serve?` — `app.listen` by default, or a `(app, port, onListen) => …`
  function (playground ALS), or `false` to wire and return without listening
  (unit tests).
- `onListen?` — default logs `localhost:<port> (development|production)`.

`.dev()` / `.prod()` return `{ app }` (and `{ vite }` in dev) so callers can
compose further.

## Package layout

```
packages/server/
  package.json          @typeway/server, exports `.` / `./dev` / `./tanstack`
  README.md
  src/
    defaults.ts         DEFAULT_SSR_ENTRY, DEFAULT_CLIENT_DIR, DEFAULT_DIST_DIR
    types.ts            FrontendAdapter, TypewayOptions, FetchHandler, Serve
    host.ts             resolvePort / distDir, maybeListen (no vite)
    static.ts           serveClientAssets + staticRoutesFor
    tanstack.ts         tanstack() — connect in .dev, statics+mount in .prod
                        (vite as `import type` only)
    prod.ts             typeway() with .prod() — safe for dist/app
    dev.ts              typeway() with .dev() — the only file that imports vite
    index.ts            re-exports prod + tanstack + types; does NOT export dev
    static.test.ts
    tanstack.test.ts
    prod.test.ts        routing + bun-build guard
```

Source uses tabs, like `@typeway/connect`. Peers: `elysia@2.0.0-rc.4`,
`vite@^8`. Runtime dep: `@typeway/connect`. No TanStack dependency — the
adapter loads `./src/server.ts` / the built handler by path.

## App migration

Both `apps/playground-with-tanstack` and `apps/e2e-tanstack`:

- Replace `server.dev.ts` / `server.prod.ts` with the snippets above.
- Delete `server/entry.ts` (the `SOURCE` constant moves into the package).
- Keep `src/server.ts` (name is load-bearing). Keep `/__entry` on the e2e
  entry. Keep `server/listen.ts`, `server/auth-plugin.ts`,
  `server/dev-bridge-probes.ts`.
- Depend on `@typeway/server` instead of `@typeway/connect` (connect becomes
  transitive).

`build` / `start` scripts stay: `vite build` then
`bun build --target bun --outfile dist/app server.prod.ts`, start via
`bun dist/app`. That keeps the bench `tanstack-ssr` arm honest.

## Tests

- **Unit (`packages/server`):** static route table (hashed assets, SSG clean
  URLs, HEAD, missing dir, API routes not stolen, root `index.html` → `/`);
  tanstack `.dev` against a fake Vite (fallback SSR, error → 500 +
  `ssrFixStacktrace`, extra middleware first); bun-build guard on the prod
  entry.
- **Existing:** `bun run typecheck`, `test:unit`, `test:integration`,
  `test:e2e-tanstack` must stay green. `/__entry` in both modes is the
  non-negotiable SSR-entry check.
- **Bench:** `bun bench/run.ts --smoke` — every arm boots, payloads stay
  byte-identical. No full-duration run required; this extraction should be
  in the noise (same `.mount()` / same `connect()` fallback).

## Out of scope

- Wrapping `vite build` or TanStack's Vite plugin. Not wrappers.
- Deduping the two apps' test helpers (called out in e2e README; wait for a
  third consumer).
- Closing PR #14. This branch supersedes it with a different name and a
  frontend adapter; #14 can close when this lands.

## Done when

- PR open against `cursor/stable-stack-upgrade-8af9` (stacks on #15), not
  `main`.
- Apps visibly smaller; duplicated Vite/manifest glue gone.
- Checks green; bench smoke clean.
- PR body summarises the API and the two tradeoffs (split entries; literal
  handler import).

## Shipped

Package: `packages/server` (`@typeway/server`). Apps migrated; `server/entry.ts`
deleted. `src/server.ts` and `/__entry` unchanged.

Verified on this branch:

- `bun run typecheck` — pass
- `bun run test:unit` — 32 pass (connect + server)
- `bun run test:integration` — 20 pass
- `bun run test:e2e-tanstack` — 26 pass (including `/__entry` in both modes)
- `bun bench/run.ts --smoke` — every arm boots, payloads byte-identical
  (TanStack SSR 9638B vs standalone; static asset 729B)
