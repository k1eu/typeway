# 05 — `typeway` CLI, then `generate model` / `generate resource`

Normative behaviour lives in [docs/conventions.md](../docs/conventions.md).
This plan is the execution order for the next packages. Do not
invent a different layout or a second data path while implementing.

Plans 01–04 (smoke, e2e, benches, `@typeway/server`) stay the HTTP
contract. The CLI must not change those behaviours. Apps keep
`bun run dev` / `build` / `start`; `typeway dev` is a thin alias.

## Why a package, not a script in the app

`typeway new` has to exist before there is an app. The bin lives in
`packages/cli`, name `typeway`, and is the only new workspace
member this plan adds. It depends on `elysia` (to import `backend`
for `routes --json`) and `@elysia/eden` only when generate resource
needs Treaty in tests it writes — the CLI itself should not wrap
Eden.

No `@typeway/core`, `@typeway/env`, `@typeway/model`. Glue is
**copied into the app** by `new` / `generate`, then ejectable.

## Constraints inherited from 04 and the playground

1. **Split entries.** `server.dev.ts` imports `@typeway/server/dev`.
   `server.prod.ts` imports `@typeway/server`. The CLI must not
   merge them or re-export `/dev` from a helper the prod file
   imports.
2. **Literal prod handler.** `await import("./dist/server/server.js")`
   stays a string in `server.prod.ts`. The CLI copies that file; it
   does not generate a variable path.
3. **`src/server.ts` is the SSR entry.** `typeway new` writes it
   under that name. A test in the CLI fixture fails if the file is
   missing (TanStack would silently use its packaged default).
4. **ALS listen.** Copied `server/listen.ts` uses `Bun.serve` +
   `withFetchContext`. `typeway({ serve: listen })`.
5. **Named `/api/auth` routes**, never `.mount(auth.handler)`. Auth
   is out of scope for this plan except leaving the hook points.
6. **Elysia 2 pin.** `elysia@2.0.0-rc.4` exact. Eden is
   `@elysia/eden@2.0.0-rc.1` until types are checked (hub open
   question 2). Route config is the second argument.
7. **Drizzle 1.0 RC.** `defineRelations`, `drizzle({ client,
   relations })`, v1 migration folders, sync bun-sqlite
   transactions.
8. **Tabs vs spaces.** `packages/cli` source uses tabs, like
   connect/server. Generated **app** files use spaces, like the
   playground.

## Slice 1 — `packages/cli` bin

```
packages/cli/
  package.json          name: typeway, bin: { typeway: ./src/cli.ts }
  README.md
  src/
    cli.ts              argv, --json, --dry-run, --help, exit codes
    new.ts
    dev.ts
    build.ts
    start.ts
    routes.ts           typeway routes --json
    json.ts             { ok, error } helpers
    cli.test.ts         argv / json / dry-run
```

`package.json` `bin` points at the TypeScript entry (`bun` runs it).
Do not add a compile step.

### Commands in this slice

| Argv | Behaviour |
| --- | --- |
| `typeway new <dir>` | Copy the app skeleton (below). Refuse if `<dir>` exists unless `--force`. |
| `typeway dev` | `bun --bun --watch run server.dev.ts` in cwd. Forwards `PORT` / `HMR_PORT`. |
| `typeway build` | `bun run build` in cwd. |
| `typeway start` | `bun dist/app` after asserting `dist/app` exists. |
| `typeway routes --json` | Import `./server/app.ts`, print `backend` route table. |
| `typeway --help` | Human text. `--json` prints `{ ok, commands }`. |

`dev` / `build` / `start` are **aliases**, not wrappers of Vite.
They spawn the app scripts so a human who never installs the CLI
still has a working `package.json`. If `server.dev.ts` is missing,
exit 1 with `typeway.routes.unreadable`-style JSON when `--json`.

### `typeway new` skeleton

Write the tree in [docs/conventions/layout.md](../docs/conventions/layout.md)
minus jobs/mailers bodies (empty dirs with `.gitkeep`), minus
auth files, with:

- `app/context.ts` using the `globalThis.__typewayContext` singleton
- `app/transaction.ts` (sync sqlite)
- `app/errors.ts` (`Unauthenticated`, `EnvInvalid`, `typeBase`)
- `config/env.ts` as in the config spec, sqlite defaults
- `config/database.ts` with `relations` from an empty
  `db/schema/relations.ts`
- `server/app.ts` with `GET /api/hello` and `export type Backend`
- `server/listen.ts` + `fetch-context.ts` putting `{ db, txDepth,
  request, backend }` in ALS
- `src/server.ts` (load-bearing name), `src/lib/api.ts` +
  `api.server.ts`, a home page
- `AGENTS.md` with the managed block, `llms.txt`, `README.md`
- `tests/helpers.ts` + `tests/integration.test.ts` asserting
  `/api/hello` and `GET /` SSR
- `package.json` scripts identical in spirit to
  `apps/playground-with-tanstack` (`dev`, `build:frontend`,
  `build:server`, `start`, `test`)

`new --dry-run --json` lists writes, creates nothing.

Fixture test: `typeway new /tmp/tw-app && cd /tmp/tw-app && bun
install && bun test`. That is slow; run it as a CLI integration
test tagged so unit argv tests stay fast. Minimum: after `new`,
`server.dev.ts` and `src/server.ts` exist and `routes --json`
includes `GET /api/hello`.

### `typeway routes --json`

```ts
const { backend } = await import(pathToFileURL(`${cwd}/server/app.ts`).href)
const routes = backend.routes.map((r) => ({
  method: r.method,
  path: r.path,
  file: null,
  auth: false,
}))
```

Confirm the Elysia 2 RC shape of `backend.routes` in a unit test
against a tiny in-file `new Elysia({ prefix: "/api" }).get("/hello",
…)`. Do not guess field names. `file` may stay `null` until slice 3
writes `.typeway/generate.json`.

## Slice 2 — `typeway models --json` + `generate model`

```
packages/cli/src/
  models.ts
  generate/
    model.ts
    plural.ts           name + "s", --plural override
    agents-md.ts        rewrite managed block
    manifest.ts         .typeway/generate.json
```

### `generate model <name>`

`name` is `/^[a-z][a-z0-9-]*$/`. Default plural `name + "s"`
(`article` → `articles`). `--plural people` for irregulars. No
inflection library.

Writes (spaces, playground style):

| Path | Action |
| --- | --- |
| `db/schema/<plural>.ts` | `sqliteTable`, integer PK, `createdAt` / `updatedAt`, `title` + `body` text columns as the default shape (`--columns` is out of scope) |
| `db/schema/index.ts` | append `export * from "./<plural>"` if missing |
| `db/schema/relations.ts` | add an empty `<plural>: {}` key if missing |
| `app/schemas/<singular>.ts` | `Create` / `Update` / `Params` / output TypeBox |
| `app/models/<singular>.ts` | `all` / `find` / `create` / `update` / `destroy` via `getDb()` |
| `app/models/<singular>.test.ts` | create + all, `afterEach` DELETE |
| `db/factories/<singular>.ts` | `getDb().insert` with overrides |
| `AGENTS.md` | regenerate managed block + inventory line |
| `llms.txt` | regenerate |
| `.typeway/generate.json` | record the model so `models --json` is exact |

Does **not**: run drizzle-kit, write a migration, add HTTP, add a
page. Print `run bun run db:generate` on success.

Idempotence: existing files `skip` unless `--force`. `index.ts` /
`relations.ts` / `AGENTS.md` updates are patch-in-place and
convergent (running twice does not duplicate exports).

Always `bun test app/models/<singular>.test.ts` before exit 0.
Needs a migrated schema — the test database must apply SQL. For
the first cut, `generate model` also writes a **hand-authored**
initial `db/migrations/<timestamp>_create_<plural>/migration.sql`
matching the table (CREATE TABLE). That avoids wrapping drizzle-kit
while still having a passing test. Document that humans re-generate
with drizzle-kit after edits; the hand SQL is a bootstrap.

`--dry-run --json` as in [agents](../docs/conventions/agents.md).

### `typeway models --json`

Read `.typeway/generate.json` if present, else scan
`app/models/*.ts`. Output the schema in the conventions spec.

## Slice 3 — `generate resource <name>`

Depends on slice 2. If the model files are missing, run generate
model first (same process, not a user-visible extra command unless
`--model-only` was passed).

Additional writes:

| Path | Action |
| --- | --- |
| `server/routes/<plural>.ts` | five actions, TypeBox from `app/schemas`, return `HTTPError.id` on miss |
| `server/routes/<plural>.test.ts` | Eden in-process: index, create, 422, 404 |
| `server/app.ts` | `.use(<plural>Api)` method-chained, idempotent |
| `src/routes/<plural>/index.tsx` | loader calls `api().api.<plural>.get()` (exact chain from fixture) |
| `src/routes/<plural>/$id.tsx` | show page, 404 via Eden error |
| `app/errors.ts` | append `<Singular>NotFound` if missing |
| `AGENTS.md` / `llms.txt` / manifest | inventory includes methods + paths |

Pages import `src/lib/api.ts` only. They do not import the model.
They do not `createServerFn`.

**Fixture that must exist before generating pages:** a unit test
that constructs `new Elysia({ prefix: "/api" }).use(new Elysia({
prefix: "/articles" }).get("/", () => []))`, treaties it, and
records whether the call is `api.api.articles.get()` or
`api.articles.get()`. The generator emits that chain. Update
[docs/conventions.md](../docs/conventions.md) open question 1 in
the same commit.

**Client-bundle guard:** after generating a resource into the CLI
fixture app, `bun run build:frontend` and assert no `bun:sqlite`
or `drizzle` in `dist/client`. If it fails, switch `src/lib/api.ts`
to HTTP-only and keep `api.server.ts` for request specs / loaders
that live in `.server.ts` files; amend the spec in that commit.

Always `bun test app/models/<singular>.test.ts
server/routes/<plural>.test.ts` before exit 0.

Auth, nested resources, `--columns`, jobs, mailers: **out of
scope**.

## Tests for the CLI package

- Argv: `--help`, unknown command → 1, `--json` error shape.
- `routes --json` against an in-memory Elysia app (no filesystem).
- `generate model --dry-run --json` write list (golden).
- `generate model` into a temp copy of the `new` skeleton: files
  exist, second run is all `skip`, unit test passes.
- `generate resource` in that tree: Eden spec passes, `server/app.ts`
  still typechecks (`bun check`), Treaty chain matches the fixture.
- Client chunk guard (slice 3).
- Do not require `test:e2e-tanstack` to go green for CLI unit tests.
  A dogfood follow-up (out of this plan) may run `generate resource
  notes` on the playground.

## Package.json / workspace

- Add `packages/cli` to the workspace (already `packages/*`).
- Root README CLI section should link this plan until the bin is
  real; after slice 1, point at `packages/cli/README.md`.
- Pin `elysia: 2.0.0-rc.4`, `@elysia/eden: 2.0.0-rc.1` (confirm),
  `drizzle-orm: 1.0.0-rc.5` as the skeleton's dependencies, matching
  the playground.

## Out of scope

- `typeway add auth` / jobs / mailers / `db migrate` / `console`.
- Wrapping Vite, TanStack's plugin, or drizzle-kit.
- Closing the playground dual path (notes server fn) — that is
  dogfood after slice 3, its own PR.
- Inflection library, Postgres variant, savepoints.
- A docs website at `typeway.dev/errors`. `docs/errors.md` is the
  catalog.

## Done when

- PR open against `cursor/extract-server-5aa9` (or `main` once 15/16
  have landed — follow the stack in flight).
- `packages/cli` exists; `typeway new` + `generate model` +
  `generate resource` covered by tests above.
- Conventions spec open questions 1 and 10 either resolved in the
  spec or explicitly still open with a fixture pointing at them.
- `bun run typecheck`, `test:unit`, `test:integration`,
  `test:e2e-tanstack` still green. CLI tests run as part of
  `bun test packages/`.
- PR body lists the Treaty path the fixture locked and any spec
  amendments.

This **docs** PR (the one that added `docs/conventions.md` and this
plan) is **not** slice 1. Do not start `packages/cli` here.
