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
- `apps/playground-with-tanstack` — dogfood app: `server.dev.ts` (Vite middlewareMode through `connect()`, TanStack SSR in `fallback`), `server.prod.ts` (`Bun.file` static + built handler). Human playground — keep it small; new protocol fixtures go in `apps/e2e-tanstack`.
- `apps/e2e-tanstack` — kitchen-sink fixture app: one route per TanStack feature that crosses HTTP (streaming SSR, server fns, redirects, `notFound()`, cookies, multipart, SSE, binary assets), tested in dev *and* prod
- `bench/` — paired A/B benchmarks; deliberately **not** a workspace member (see its README)
- `plans/` — self-contained plans for pending work; `plans/README.md` has shared context and gotchas

## Conventions & gotchas

- Elysia is pinned to `^2.0.0-beta.1` — check API against v2, not v1 docs (e.g. plugin hooks, `.all("*")`).
- `packages/connect` source uses tabs; playground apps use spaces. Match the file you're in.
- Workspace scripts from root: `bun run --filter <pkg-name> <script>` (`bun --cwd` needs an absolute path).
- Vite dev serves CSS imports as JS modules — don't assert `text/css` in dev-mode tests.
- Vite HMR websocket lives on port 24678 in middleware mode, not the app port. Fixture servers take `HMR_PORT` so parallel test runs don't collide there.
- **TanStack disables streaming SSR for bots.** It runs `isbot(user-agent)` and, on a match, waits for React's `allReady` before sending anything — so the whole document arrives as one chunk. Bun's default `Bun/x.y.z` UA and curl both match. Any streaming assertion must send a browser UA (`BROWSER_UA` in `apps/e2e-tanstack/tests/helpers.ts`); otherwise the test silently measures the non-streaming path and passes for the wrong reason.
- TanStack server functions are POSTed to compiler-generated `/_serverFn/<id>` URLs and need `sec-fetch-site: same-origin` (CSRF) plus `x-tsr-serverFn: true`; payloads are seroval-encoded in and out.
- Responses from `connect()`'s `fallback` (i.e. all TanStack SSR) never travel through `BridgeResponse`/`BridgeRequest` — the bridge only hands the fallback the `Request`. Tests meant to cover bridge streaming or raw-body behavior must go through actual Connect middleware, not through SSR.
- Tests live next to source (`src/*.test.ts`), `bun:test`. When changing bridge behavior, `packages/connect/src/index.test.ts` is the behavioral contract.
- Don't add runtime dependencies to `packages/connect` without strong justification.
