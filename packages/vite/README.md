# @typeway/vite

Host a Vite + TanStack Start app under [Elysia](https://elysiajs.com). Thin glue: Vite's own `middlewareMode` in dev (through [`@typeway/connect`](../connect)), a boot-time `dist/client` manifest and `.mount()` in prod.

App servers shrink to a few lines. The Vite config, the SSR entry, and the built handler stay yours.

```ts
// server.dev.ts
import { viteDev } from "@typeway/vite";
import { Elysia } from "elysia";
import { backend } from "./server/app";

const app = new Elysia()
  .use(backend)
  .use(await viteDev());

app.listen(Number(process.env.PORT ?? 3000));
```

```ts
// server.prod.ts
import { viteProd } from "@typeway/vite";
import { Elysia } from "elysia";
import { backend } from "./server/app";

// Specifier must stay literal — `bun build --target bun` inlines it.
// @ts-ignore built output only exists after `bun run build`
const { default: handler } = await import("./dist/server/server.js");

const app = new Elysia()
  .use(backend)
  .use(await viteProd({ handler }));

app.listen(Number(process.env.PORT ?? 3000));
```

## API

### `viteDev(options?)`

- `entry?: string` — SSR module loaded through Vite's per-environment runner. Default: `./src/server.ts`.
- `middleware?: ConnectMiddleware | ConnectMiddleware[]` — extra Connect middleware run before Vite (e.g. test probes).
- `hmrPort?: number` — HMR websocket port. Default: `HMR_PORT` env, or `24678`.
- `vite?: InlineConfig` — merged into `createServer()`. `middlewareMode` is always on.

Returns an Elysia plugin.

### `viteProd({ handler, clientDir? })`

- `handler` — `{ fetch(request): Response | Promise<Response> }`. Import the built TanStack entry with a **literal** specifier in the boot file.
- `clientDir?: string` — default `./dist/client`. Missing dir fails at boot.

Returns an Elysia plugin.

### Conventions

`DEFAULT_SSR_ENTRY` is `./src/server.ts`. That name is load-bearing: TanStack's Vite plugin uses it as the SSR build input, and silently falls back to its packaged default entry when the file is absent. A differently-named dev entry compiles to a different module in prod.

The built file is `dist/server/server.js`. `bun build --target bun` has to see that path statically to inline the bundle into `dist/app` — do not pass it through a variable.

## How it behaves

- **Registered routes win.** `.use(backend)` before `.use(viteDev())` / `.use(viteProd())`. `/api/*` never touches Vite, the bridge, or the SSR mount.
- **Dev fallback is TanStack SSR.** Vite serves transforms and `@vite/client`; everything else is `environments.ssr.runner.import(entry)`. `ssrLoadModule` is on Vite 8's `future` removal list.
- **Prod statics are a manifest, not a probe.** `dist/client` is walked once. Prerendered `<route>/index.html` is also registered at the clean URL and the trailing-slash form, so SSG does not fall through to SSR.
- **Prod SSR is `.mount()`, not the bridge.** The built handler already speaks `Request`/`Response`. The connect bridge is for Connect/Express middleware — Vite's dev server — only.
- **HMR has its own port.** Websocket upgrades cannot be forwarded through the bridge. Override with `hmrPort` or `HMR_PORT` so parallel test runs do not collide (default 24678). Use `server.ws.port`, not the deprecated `server.hmr` transport fields.

## Eject

`viteDev` is `createServer({ server: { middlewareMode: true } })` plus `connect(vite.middlewares, { fallback })`. `viteProd` is a `Bun.Glob` walk and `app.mount(handler.fetch)`. Copy those ~40 lines out of `src/dev.ts` / `src/prod.ts` if the package stops fitting.
