# @typeway/server

Host an Elysia app with a pluggable frontend. Thin glue: Vite's own
`middlewareMode` in dev (through [`@typeway/connect`](../connect)), a boot-time
`dist/client` manifest and `.mount()` in prod.

The product is still conventions, not wrappers. Vite config, the SSR entry, and
the built handler stay yours. Copy `src/dev.ts` / `src/tanstack.ts` /
`src/static.ts` out if the package stops fitting.

Named `@typeway/server` rather than `@typeway/vite`: production does not use
Vite, and the public function is `typeway({ app, frontend })` — the HTTP host.
Vite is an implementation detail of `.dev()`.

`typeway().dev()` and `typeway().prod()` are **separate entry points**.
Importing the dev function from the package root would pull `vite` (and
rolldown native bindings) into the prod `bun build` of `dist/app`.

```ts
// server.dev.ts
import { typeway, tanstack } from "@typeway/server/dev";
import { Elysia } from "elysia";
import { backend } from "./server/app";

await typeway({
  app: new Elysia().use(backend),
  frontend: tanstack(),
}).dev();
```

```ts
// server.prod.ts
import { typeway, tanstack } from "@typeway/server";
import { Elysia } from "elysia";
import { backend } from "./server/app";

// Specifier must stay literal — `bun build --target bun` inlines it.
// @ts-ignore built output only exists after `bun run build`
const { default: handler } = await import("./dist/server/server.js");

await typeway({
  app: new Elysia().use(backend),
  frontend: tanstack({ handler }),
}).prod();
```

`PORT` (default 3000) and `HMR_PORT` (default 24678) are read from the
environment. Pass `serve` to replace `app.listen` — the playground uses this
for its AsyncLocalStorage `Bun.serve` wrapper.

## Frontend adapters

```ts
type FrontendAdapter = {
  name: string;
  build?: { entry?: string; client?: string; handler?: string };
  dev(vite: ViteDevServer, app: Elysia): void | Promise<void>;
  prod(app: Elysia, distDir: string): void | Promise<void>;
};
```

The host creates the Vite dev server, binds `PORT`, and passes `distDir` into
`prod`. The adapter wires that frontend into Elysia. `tanstack()` is the first
implementation; a later Solid/Nuxt adapter is a new function that returns the
same shape.

`build` is layout (`src/server.ts` → `dist/server/server.js`, client assets
under `dist/client`), not a wrapper around `vite build`. Apps keep
`bun --bun vite build` and `bun build --target bun --outfile dist/app`.

## `tanstack(options?)`

- `entry?: string` — SSR module loaded through Vite's per-environment runner.
  Default: `./src/server.ts`.
- `handler?: { fetch(request): Response | Promise<Response> }` — **required in
  production**. Import the built TanStack entry with a **literal** specifier in
  the boot file.
- `middleware?: ConnectMiddleware | ConnectMiddleware[]` — extra Connect
  middleware run before Vite (e.g. test probes).
- `clientDir?: string` — default `<distDir>/client`. Missing dir fails at boot.

## Conventions

`DEFAULT_SSR_ENTRY` is `./src/server.ts`. That name is load-bearing: TanStack's
Vite plugin uses it as the SSR build input, and silently falls back to its
packaged default entry when the file is absent. A differently-named dev entry
compiles to a different module in prod. `apps/e2e-tanstack`'s `/__entry` route
is the guard that both modes run this file.

The built file is `dist/server/server.js`. `bun build --target bun` has to see
that path statically to inline the bundle into `dist/app` — do not pass it
through a variable, and do not move the import into this package.

## How it behaves

- **Registered routes win.** `.use(backend)` on `app` before `typeway()` wires
  the frontend. `/api/*` never touches Vite, the bridge, or the SSR mount.
- **Dev fallback is TanStack SSR.** Vite serves transforms and `@vite/client`;
  everything else is `environments.ssr.runner.import(entry)`. `ssrLoadModule`
  is on Vite 8's `future` removal list.
- **Prod statics are a manifest, not a probe.** `dist/client` is walked once.
  Prerendered `<route>/index.html` is also registered at the clean URL and the
  trailing-slash form, so SSG does not fall through to SSR.
- **Prod SSR is `.mount()`, not the bridge.** The built handler already speaks
  `Request`/`Response`. The connect bridge is for Connect/Express middleware —
  Vite's dev server — only.
- **HMR has its own port.** Websocket upgrades cannot be forwarded through the
  bridge. Override with `hmrPort` or `HMR_PORT` so parallel test runs do not
  collide (default 24678). Use `server.ws.port`, not the deprecated `server.hmr`
  transport fields.

## Eject

`.dev()` is `createServer({ server: { middlewareMode: true } })` plus
`connect(vite.middlewares, { fallback })`. `.prod()` is a `Bun.Glob` walk and
`app.mount(handler.fetch)`. The adapter is ~80 lines in `src/tanstack.ts`.
