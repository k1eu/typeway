# Typeway test infrastructure plans

Execute in order — each plan builds on the previous one.

1. [01-integration-smoke-test.md](./01-integration-smoke-test.md) — codify the Elysia + Vite + TanStack smoke checks into a real test suite, wire PR CI, and add a scheduled version-compatibility matrix.
2. [02-tanstack-feature-coverage.md](./02-tanstack-feature-coverage.md) — a kitchen-sink fixture app exercising every TanStack Start feature that traverses `@typeway/connect`, tested in both dev and prod modes.
3. [03-throughput-benchmarks.md](./03-throughput-benchmarks.md) — paired A/B benchmarks measuring what the glue costs vs clean Elysia and standalone TanStack.

## Shared repo context (read first)

- **Monorepo:** Bun workspaces (`packages/*`, `apps/*`). Bun 1.4 canary, Elysia `^2.0.0-beta.1`. Root `bun test` runs all workspace tests.
- **`packages/connect`** — `@typeway/connect`, zero runtime deps. API:
  `connect(middleware | middleware[], options?)` returns an Elysia plugin that registers a **wildcard route** (`.all("*")`), not a global hook. Registered routes (e.g. `/api/*`) take precedence over the wildcard and never touch the bridge. `options.fallback: (request: Request) => Response | Promise<Response>` runs when all middleware calls `next()` without responding (default 404); headers set by middleware are merged onto the fallback response.
  - Request bodies are forwarded to middleware as **raw streams** (`req.on("data"...)`), never pre-parsed.
  - Responses stream: the web `Response` resolves on first `res.write()`/`flushHeaders()`/`end()`.
  - Source: `src/index.ts` (plugin), `src/request.ts`, `src/response.ts`, `src/chain.ts`. Unit tests with reusable patterns: `src/index.test.ts` (12 tests).
- **`apps/playground-with-tanstack`** — TanStack Start app hosted under Elysia:
  - Dev: `bun run dev` → `server.dev.ts`: Vite in `middlewareMode` through `connect()`, TanStack SSR via `viteDevServer.ssrLoadModule("./src/tanstack-server.ts")` in the `fallback`. Respects `PORT` env (default 3000).
  - Prod: `bun run build` (vite build + `bun build --target bun --outfile dist/app server.prod.ts`), then `bun run start` (`bun dist/app` — note: `bun build` output is NOT executable directly, must run through `bun`).
  - Demo API route: `GET /api/hello?name=x` → `{"message":"Hello x"}` (in `server/app.ts`).

## Known gotchas

- `bun --cwd` requires an **absolute** path; use `bun run --filter <pkg-name> <script>` for workspace scripts from root.
- In dev, Vite's HMR websocket listens on a **separate port 24678** (middleware mode default) — websocket upgrades on the app port fall through to SSR. Don't write tests assuming HMR shares the app port.
- Vite serves CSS in dev as `text/javascript` modules — assert on status/body, not content-type, for `/src/styles.css`.
- A valid 304 test needs a real ETag: GET the asset, replay with `If-None-Match: <etag>`, expect 304 + empty body.
- Kill dev/prod servers between tests (`proc.kill()`); port collisions are the main flake source. Prefer a random port per test file via `PORT`.
