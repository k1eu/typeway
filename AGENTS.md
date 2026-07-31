# Typeway

Rails-like TypeScript framework: thin glue over blessed libraries (Bun 1.4 canary + Elysia 2.0 beta + Vite + TypeBox), unified conventions, docs, and generators. AI agents are first-class users — conventions must stay deterministic and greppable. The product is conventions and generators, **not wrappers**: integrations stay thin and ejectable.

## Commands

- `bun install` — workspace install (root)
- `bun test` — all workspace tests
- `cd apps/playground-with-tanstack && bun run dev` — TanStack-under-Elysia dev server (port 3000, `PORT` env respected)
- `cd apps/playground-with-tanstack && bun run build && bun run start` — prod build + serve (`bun build` output is not executable; always run via `bun dist/app`)

## Layout

- `packages/connect` — `@typeway/connect`: Connect/Express middleware under Elysia. Zero runtime deps (only `elysia` peer). Read its README before touching it; key invariants: wildcard-route mounting (registered routes bypass the bridge), raw streamed request bodies (never pre-parse), streaming responses (Response resolves on first write), Set-Cookie arrays preserved, empty-body statuses (204/304) get null bodies.
- `apps/playground` — minimal Elysia scratch app
- `apps/playground-with-tanstack` — dogfood app: `server.dev.ts` (Vite middlewareMode through `connect()`, TanStack SSR in `fallback`), `server.prod.ts` (`Bun.file` static + built handler)
- `plans/` — self-contained plans for pending work; `plans/README.md` has shared context and gotchas

## Conventions & gotchas

- Elysia is pinned to `^2.0.0-beta.1` — check API against v2, not v1 docs (e.g. plugin hooks, `.all("*")`).
- `packages/connect` source uses tabs; playground apps use spaces. Match the file you're in.
- Workspace scripts from root: `bun run --filter <pkg-name> <script>` (`bun --cwd` needs an absolute path).
- Vite dev serves CSS imports as JS modules — don't assert `text/css` in dev-mode tests.
- Vite HMR websocket lives on port 24678 in middleware mode, not the app port.
- Tests live next to source (`src/*.test.ts`), `bun:test`. When changing bridge behavior, `packages/connect/src/index.test.ts` is the behavioral contract.
- Don't add runtime dependencies to `packages/connect` without strong justification.
