# Typeway test infrastructure plans

Plans 01–04 are **done**. They shipped the integration smoke suite, TanStack
feature coverage, paired throughput benchmarks, and `@typeway/server`. Keep
this file as shared context for the glue, not as a queue of unfinished work.

Plan 05 is the next package. The conventions it implements are
[`docs/conventions.md`](../docs/conventions.md), not an invention of the CLI.

1. [01-integration-smoke-test.md](./01-integration-smoke-test.md) — **done.** Elysia + Vite + TanStack smoke checks, PR CI, scheduled version-compatibility matrix.
2. [02-tanstack-feature-coverage.md](./02-tanstack-feature-coverage.md) — **done.** Kitchen-sink fixture app (`apps/e2e-tanstack`) exercising TanStack Start features that traverse `@typeway/connect`, tested in both dev and prod.
3. [03-throughput-benchmarks.md](./03-throughput-benchmarks.md) — **done.** Paired A/B benchmarks in `bench/` measuring glue cost vs clean Elysia and standalone TanStack.
4. [04-extract-server.md](./04-extract-server.md) — **done.** `@typeway/server`: `typeway({ app, frontend: tanstack() })`, frontend adapter, split dev/prod entries.
5. [05-cli-and-generators.md](./05-cli-and-generators.md) — **slices 1–3 done.** `typeway` bin: `new` / `dev` / `build` / `start` / `routes` / `generate model|resource` / `models --json`.

## Shared repo context (read first)

- **Monorepo:** Bun workspaces (`packages/*`, `apps/*`). Bun 1.4.4, Elysia `2.0.0-rc.4` (exact pin; npm `latest` is 1.4). Root `bun test` runs all workspace tests; `bun run typecheck` runs `bun check`.
- **`packages/connect`** — `@typeway/connect`, zero runtime deps. API:
  `connect(middleware | middleware[], options?)` returns an Elysia plugin that registers a **wildcard route** (`.all("*")`), not a global hook. Registered routes (e.g. `/api/*`) take precedence over the wildcard and never touch the bridge. `options.fallback: (request: Request) => Response | Promise<Response>` runs when all middleware calls `next()` without responding (default 404); headers set by middleware are merged onto the fallback response.
  - Request bodies are forwarded to middleware as **raw streams** (`req.on("data"...)`), never pre-parsed.
  - Responses stream: the web `Response` resolves on first `res.write()`/`flushHeaders()`/`end()`.
  - Source: `src/index.ts` (plugin), `src/request.ts`, `src/response.ts`, `src/chain.ts`. Unit tests with reusable patterns: `src/index.test.ts`.
- **`packages/server`** — `@typeway/server`. `typeway({ app, frontend: tanstack() })` from `@typeway/server/dev` (dev) or `@typeway/server` (prod). Prod barrel must not re-export `/dev` (Vite/rolldown in `dist/app`). The prod handler import stays a literal `./dist/server/server.js` in the app so `bun build` can inline it.
- **`apps/playground-with-tanstack`** — TanStack Start app hosted under Elysia via `@typeway/server`:
  - Dev: `bun run dev` → `server.dev.ts`: `typeway({ app, frontend: tanstack(), serve: listen }).dev()`. Respects `PORT` env (default 3000).
  - Prod: `bun run build` (vite build + `bun build --target bun --outfile dist/app server.prod.ts`), then `bun run start` (`bun dist/app` — note: `bun build` output is NOT executable directly, must run through `bun`).
  - Demo API route: `GET /api/hello?name=x` → `{"message":"Hello x"}` (in `server/app.ts`).

## Known gotchas

- `bun --cwd` requires an **absolute** path; use `bun run --filter <pkg-name> <script>` for workspace scripts from root.
- In dev, Vite's HMR websocket listens on a **separate port 24678** (middleware mode default) — websocket upgrades on the app port fall through to SSR. Don't write tests assuming HMR shares the app port. Configure it as `server.ws.port` (`server.hmr` transport fields are deprecated in Vite 8).
- Vite serves CSS in dev as `text/javascript` modules — assert on status/body, not content-type, for `/src/styles.css`.
- A valid 304 test needs a real ETag: GET the asset, replay with `If-None-Match: <etag>`, expect 304 + empty body.
- Kill dev/prod servers between tests (`proc.kill()`); port collisions are the main flake source. Prefer a random port per test file via `PORT`.
