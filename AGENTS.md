# Typeway

Rails-like TypeScript framework: thin glue over blessed libraries (Bun 1.4 canary + Elysia 2.0 beta + Vite + TypeBox), unified conventions, docs, and generators. AI agents are first-class users — conventions must stay deterministic and greppable. The product is conventions and generators, **not wrappers**: integrations stay thin and ejectable.

## Commands

- `bun install` — workspace install (root)
- `bun test` — all workspace tests
- `bun run test:unit` — `packages/` unit tests only
- `bun run test:integration` — boots the playground's real dev + prod servers and asserts the Elysia/Vite/TanStack contract
- `bun run test:e2e-tanstack` — TanStack feature coverage (`apps/e2e-tanstack`) against both dev and prod
- `bun run bench` — paired A/B throughput benchmarks (needs `oha`; falls back to a built-in load generator). See `bench/README.md`.
- `cd apps/playground-with-tanstack && bun run dev` — TanStack-under-Elysia dev server (port 3000, `PORT` env respected)
- `cd apps/playground-with-tanstack && bun run build && bun run start` — prod build + serve (`bun build` output is not executable; always run via `bun dist/app`)

## Layout

- `packages/connect` — `@typeway/connect`: Connect/Express middleware under Elysia. Zero runtime deps (only `elysia` peer). Read its README before touching it; key invariants: wildcard-route mounting (registered routes bypass the bridge), raw streamed request bodies (never pre-parse), streaming responses (Response resolves on first write), Set-Cookie arrays preserved, empty-body statuses (204/304) get null bodies.
- `apps/playground` — minimal Elysia scratch app
- `apps/playground-with-tanstack` — dogfood app: `server.dev.ts` (Vite middlewareMode through `connect()`, TanStack SSR in `fallback`), `server.prod.ts` (boot-time `dist/client` manifest as static routes + `.mount()`ed SSR handler), and `/rendering` — one page each for SSG (prerendered via `pages` in `vite.config.ts`, served in prod as a static route at its clean URL), SSR and SPA (`ssr: false`). Human playground — keep it small; new protocol fixtures go in `apps/e2e-tanstack`.
- `apps/e2e-tanstack` — kitchen-sink fixture app: one route per TanStack feature that crosses HTTP (streaming SSR, server fns, redirects, `notFound()`, cookies, multipart, SSE, binary assets), tested in dev *and* prod
- `bench/` — paired A/B benchmarks; deliberately **not** a workspace member (see its README)
- `plans/` — self-contained plans for pending work; `plans/README.md` has shared context and gotchas

## Conventions & gotchas

- Elysia is pinned to `^2.0.0-beta.1` — check API against v2, not v1 docs (e.g. plugin hooks, `.all("*")`).
- `packages/connect` source uses tabs; playground apps use spaces. Match the file you're in.
- Workspace scripts from root: `bun run --filter <pkg-name> <script>` (`bun --cwd` needs an absolute path).
- Vite dev serves CSS imports as JS modules — don't assert `text/css` in dev-mode tests.
- Vite HMR websocket lives on port 24678 in middleware mode, not the app port. Fixture servers take `HMR_PORT` so parallel test runs don't collide there. Configure it as `server.ws.port` — every transport field on `server.hmr` is `@deprecated` in Vite 8 (silently shimmed into `server.ws.*`, so the old spelling looks fine right up until it is removed).
- **`src/server.ts` is the one SSR entry, and the name is load-bearing.** TanStack's Vite plugin resolves the SSR build input by convention (`src/server.{ts,tsx,...}`), silently falling back to its own packaged default entry when that file is absent — so a differently-named dev entry compiles to a *different module* in prod, and anything added to it works in dev and vanishes in the build. `apps/e2e-tanstack`'s `/__entry` route guards this in both modes.
- Prefer Elysia's own primitives over glue: `.mount(handler)` hosts a fetch-native handler (what TanStack's build emits) with ~0.4 µs overhead, vs ~5 µs for a `connect()` bridge round-trip. The bridge is for Connect/Express middleware — i.e. Vite's dev server — not for things that already speak `Request`/`Response`.
- Vite 8 has **no** fetch-native dev-server API; `server.middlewares` is the only embed path and is the one server API absent from Vite's `future` removal list. `ssrLoadModule`, `transformRequest`, `moduleGraph`, `hot` and `pluginContainer` are all on it — use `server.environments.ssr.runner.import(...)` (guarded by `isRunnableDevEnvironment`) instead of `ssrLoadModule`. `FetchableDevEnvironment` is not an escape hatch: `handleRequest` is a slot the host implements, Vite never calls `dispatchFetch`, and it serves no dev assets.
- **TanStack disables streaming SSR for bots.** It runs `isbot(user-agent)` and, on a match, waits for React's `allReady` before sending anything — so the whole document arrives as one chunk. Bun's default `Bun/x.y.z` UA and curl both match. Any streaming assertion must send a browser UA (`BROWSER_UA` in `apps/e2e-tanstack/tests/helpers.ts`); otherwise the test silently measures the non-streaming path and passes for the wrong reason.
- TanStack server functions are POSTed to compiler-generated `/_serverFn/<id>` URLs and need `sec-fetch-site: same-origin` (CSRF) plus `x-tsr-serverFn: true`; payloads are seroval-encoded in and out.
- Responses from `connect()`'s `fallback` (i.e. all TanStack SSR) never travel through `BridgeResponse`/`BridgeRequest` — the bridge only hands the fallback the `Request`. Tests meant to cover bridge streaming or raw-body behavior must go through actual Connect middleware, not through SSR.
- Tests live next to source (`src/*.test.ts`), `bun:test`. When changing bridge behavior, `packages/connect/src/index.test.ts` is the behavioral contract.
- Don't add runtime dependencies to `packages/connect` without strong justification.

## Cursor Cloud specific instructions

- Runtime is Bun canary (targets 1.4), installed to `~/.bun/bin` and symlinked to `/usr/local/bin/bun` so it resolves in non-interactive shells. The startup update script only runs `bun install`; if `bun` is ever missing, reinstall with `curl -fsSL https://bun.sh/install | bash -s -- canary`. Node is not used to run anything here.
- Standard lint/test/build/run commands live in the `## Commands` section above — reuse those. There is no separate lint/typecheck step in this repo (CI runs only unit + integration + e2e).
- All three apps (`apps/playground`, `apps/playground-with-tanstack`, `apps/e2e-tanstack`) default to port 3000, so only one dev server can run on the default port at a time. Set `PORT` (and `HMR_PORT` for the tanstack apps) to run several concurrently. Manual sanity check: `curl localhost:3000/api/hello` returns `{"message":"Hello world"}` and `GET /` is TanStack SSR.
- Integration smoke (`test:integration`) asserts a bodyless 304 on Vite conditional requests; Vite may omit `Content-Length` on those responses, so the test accepts absent or `"0"`.
