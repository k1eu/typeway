# Typeway

A batteries-included TypeScript framework in the spirit of Ruby on Rails — built as glue between best-in-class existing libraries, unified under one set of conventions, one docs format, and one CLI.

Typeway doesn't reinvent the ecosystem. It blesses proven tools, integrates them thinly, and makes everything ejectable. The product is the conventions, the docs, and the generators — not wrappers.

## Why

Every Rails app looks the same, so every Rails developer is productive on day one. TypeScript never got that. Typeway brings it — with one addition Rails never had: **AI agents as first-class users**. Conventions are deterministic and greppable, docs ship in agent-friendly formats (skills, `AGENTS.md`, `llms.txt`), and every generator installs the knowledge an agent needs alongside the code.

## Core stack

- **[Bun](https://bun.sh) 1.4** (1.4.4) — runtime, package manager, test runner, bundler, and `bun check` type checker. Also collapses a lot of glue: built-in SQLite, Postgres and S3 clients, `--compile` for single-binary deploys.
- **[Elysia](https://elysiajs.com) 2.0** (RC, pinned to `2.0.0-rc.4` — npm `latest` is 1.4) — the core HTTP host. End-to-end type safety, plugin system, Eden for a fully typed client.
- **[Vite](https://vite.dev) 8** — frontend dev server and bundling, hosted *under* Elysia via a Connect middleware bridge (`packages/connect`), so dev runs as one process with HMR.
- **[TypeBox](https://github.com/sinclairzx81/typebox)** — validation everywhere: request schemas, typed config/env, model validation.

## Planned under the umbrella

- **Models** — Drizzle ORM with conventions for structure, relations, migrations, seeds, and factories
- **Auth** — `typeway add auth` (better-auth)
- **Background jobs** — Postgres-backed queue by default, no Redis required
- **Mailers** — react-email templates, adapters, dev previews
- **Realtime** — Elysia websockets with channel conventions
- **File storage** — thin layer over Bun's native S3 client
- **Caching** — database-backed by default, Redis optional
- **Testing** — `bun test`, factories, request specs via Eden (type-checked against routes)
- **Security defaults** — CORS, secure headers, rate limiting on by default
- **Observability** — structured logging and OpenTelemetry as a convention

## Conventions

The spec generators and the CLI will be built against:

- **[docs/conventions.md](./docs/conventions.md)** — layout, the one data path (Elysia + Eden, in-process on the server), models, routes, env, testing, agent-first rules, generator order
- **[plans/05-cli-and-generators.md](./plans/05-cli-and-generators.md)** — `packages/cli` (`new` / `dev` / `build` / `start` / `routes` / `generate` / `models`)
- **[docs/generators.md](./docs/generators.md)** — `generate model` / `generate resource`, flags, field types

## CLI

The bin lives in [`packages/cli`](./packages/cli/README.md).

```sh
typeway new my-app
typeway generate resource Post title:string body:text
typeway routes --json
typeway models --json
typeway add auth            # later
```

See [docs/cli.md](./docs/cli.md). From this repo: `bun packages/cli/src/cli.ts new apps/demo --workspace`.

## Repository layout

Bun workspaces monorepo:

- `packages/connect` — `@typeway/connect`, the Connect middleware bridge for Elysia (zero runtime deps; see its README)
- `packages/server` — `@typeway/server`, the Elysia host: `typeway({ app, frontend: tanstack() })`. Vite middleware + SSR fallback in dev, boot-time `dist/client` manifest + `.mount()` in prod. Frontend is an adapter so other bundlers can plug in later.
- `packages/cli` — `typeway` bin: `new`, `dev`, `build`, `start`, `routes`, `generate`, `models`
- `apps/playground` — scratch app for trying packages during development
- `apps/playground-with-tanstack` — TanStack Start hosted under Elysia through `@typeway/server`
- `apps/e2e-tanstack` — kitchen-sink fixture app for TanStack features that cross HTTP
- `docs/` — conventions spec (`docs/conventions.md`) and error catalog
- `plans/` — remaining work (01–04 are done; 05 is the CLI and generators)

## Status

Early. The Connect bridge is functional and dogfooded by the TanStack playground: streaming responses, raw body forwarding, and registered-route bypass are in place. Integration smoke tests, TanStack feature coverage (dev + prod), version-compat CI, and throughput benchmarks are in the tree (`bun run test:integration`, `bun run test:e2e-tanstack`, `bun run bench`). App servers are `typeway({ app, frontend: tanstack() })` via `@typeway/server`. The conventions spec is written; `typeway new` / `dev` / `build` / `start` / `routes --json` ship in `packages/cli`. Generators are next.
