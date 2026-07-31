# Typeway

A batteries-included TypeScript framework in the spirit of Ruby on Rails — built as glue between best-in-class existing libraries, unified under one set of conventions, one docs format, and one CLI.

Typeway doesn't reinvent the ecosystem. It blesses proven tools, integrates them thinly, and makes everything ejectable. The product is the conventions, the docs, and the generators — not wrappers.

## Why

Every Rails app looks the same, so every Rails developer is productive on day one. TypeScript never got that. Typeway brings it — with one addition Rails never had: **AI agents as first-class users**. Conventions are deterministic and greppable, docs ship in agent-friendly formats (skills, `AGENTS.md`, `llms.txt`), and every generator installs the knowledge an agent needs alongside the code.

## Core stack

- **[Bun](https://bun.sh) 1.4** (currently `--canary`) — runtime, package manager, test runner, bundler. Also collapses a lot of glue: built-in SQLite, Postgres and S3 clients, `--compile` for single-binary deploys.
- **[Elysia](https://elysiajs.com) 2.0** (beta) — the core HTTP host. End-to-end type safety, plugin system, Eden for a fully typed client.
- **[Vite](https://vite.dev)** — frontend dev server and bundling, hosted *under* Elysia via a Connect middleware bridge (`packages/connect`), so dev runs as one process with HMR.
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

## CLI

```sh
typeway new my-app          # scaffold an opinionated app
typeway generate model post # generators for models, routes, jobs, ...
typeway add auth            # add integrated, documented capabilities
typeway db migrate          # database workflows
typeway console             # REPL with app context and models preloaded
```

## Repository layout

Bun workspaces monorepo:

- `packages/connect` — `@typeway/connect`, the Connect middleware bridge for Elysia (zero runtime deps; see its README)
- `apps/playground` — scratch app for trying packages during development
- `apps/playground-with-tanstack` — TanStack Start hosted under Elysia through the bridge: Vite middleware + SSR fallback in dev, `Bun.file` static + built handler in prod
- `plans/` — execution-ready plans for upcoming work (integration tests, feature coverage, benchmarks)

## Status

Early. The Connect bridge is functional and dogfooded by the TanStack playground: streaming responses, raw body forwarding, and registered-route bypass are in place. Next up (see `plans/`): integration test suite + version-compat CI, TanStack feature-coverage suite, and throughput benchmarks. After that: extracting `@typeway/vite` so app servers shrink to a few lines.
