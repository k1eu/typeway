# Generators

`typeway generate` writes the canonical tree from
[conventions](./conventions.md). It is a code generator, not a
runtime: after it exits, the files are yours.

```sh
typeway generate model Post title:string body:text
typeway generate resource Post title:string body:text
typeway generate resource Post --dry-run --json
```

Every generate command accepts `--dry-run` and `--json`. Combined
they are the planning API for agents. A second run without `--force`
does not duplicate code: existing generated files are `skip`, and
patches (`server/app.ts`, `db/schema/index.ts`, `relations.ts`,
`AGENTS.md`) converge.

See also [cli.md](./cli.md).

## `typeway generate model <Name> [field:type …]`

Writes the model slice and stops before HTTP.

| Path | Action |
| --- | --- |
| `db/schema/<plural>.ts` | `sqliteTable`, integer PK, `createdAt` / `updatedAt`, plus the listed columns |
| `db/schema/index.ts` | append `export * from "./<plural>"` if missing |
| `db/schema/relations.ts` | add an empty `<plural>: {}` key if missing |
| `app/schemas/<singular>.ts` | TypeBox `Create` / `Update` / `Params` / output |
| `app/models/<singular>.ts` | `all` / `find` / `create` / `update` / `destroy` via `getDb()` |
| `app/models/<singular>.test.ts` | create + all, `afterEach` DELETE |
| `db/factories/<singular>.ts` | `getDb().insert` with overrides |
| `db/migrations/<YYYYMMDDHHMMSS>_create_<plural>/` | bootstrap `migration.sql` + snapshot (so `migrate()` and later `db:generate` have a baseline) |
| `docs/<plural>.md` | doc stub |
| `AGENTS.md` / `llms.txt` | managed inventory |
| `.typeway/generate.json` | record the model |

Does **not** add Elysia routes or pages. Print `run bun run db:generate`
on success — that is for humans who later edit the table. The bootstrap
SQL is enough for the generated test to pass on a fresh app.

`<Name>` is PascalCase (`Post`) or kebab-case (`invoice-item`). Default
plural is `name + "s"`. Pass `--plural people` for irregulars. No
inflection library.

If no `field:type` arguments are given, the default shape is
`title:string body:text`.

Always runs `bun test app/models/<singular>.test.ts` before exit 0
unless `--skip-test`.

## `typeway generate resource <Name> [field:type …]`

Everything `generate model` does, plus:

| Path | Action |
| --- | --- |
| `server/routes/<plural>.ts` | five actions under `/api/<plural>` |
| `server/routes/<plural>.test.ts` | Eden in-process: index, create, 422, 404 |
| `server/app.ts` | `.use(<plural>Api)` method-chained, idempotent |
| `app/errors.ts` | `<Name>NotFound` (`<resource>.not_found`) |
| `src/routes/<plural>/index.tsx` | loader calls `api().api.<plural>.get()` |
| `src/routes/<plural>/$id.tsx` | show; 404 via Eden + `notFound()` |
| `src/routes/<plural>/new.tsx` | browser `post` |
| `src/routes/<plural>/$id.edit.tsx` | browser `patch` |
| `docs/<plural>.md` | routes + pages |
| `src/routeTree.gen.ts` | `tsr generate` when `@tanstack/router-cli` is installed |

Pages import `src/lib/api.ts` only. They do not import the model.
They do not `createServerFn`.

Treaty path (locked in `packages/cli/src/eden-path.test.ts`):
`api().api.<plural>.get()`, not `api().<plural>.get()`.

Always runs the model test **and** `server/routes/<plural>.test.ts`
before exit 0 unless `--skip-test`. Then, if the app has
`node_modules/@tanstack/router-cli`, runs `bun run generate-routes`.

## Field types

`name:type` tokens after the resource name. Repeatable.

| Token | Drizzle | TypeBox create | Factory default |
| --- | --- | --- | --- |
| `string` / `str` | `text` | `t.String({ minLength: 1, maxLength: 200 })` | `"Untitled"` if the field is `title`, else the field name |
| `text` | `text` | `t.String({ minLength: 1 })` | `"lorem ipsum"` |
| `integer` / `int` | `integer` | `t.Number()` | `0` |
| `boolean` / `bool` | `integer({ mode: "boolean" })` | `t.Boolean()` | `false` |
| `timestamp` / `datetime` / `date` | `integer({ mode: "timestamp_ms" })` | `t.Date()` | `new Date()` |
| `real` / `float` / `number` | `real` | `t.Number()` | `0` |

`id`, `createdAt`, and `updatedAt` are reserved — they are always
added. Unknown types exit 1 with `typeway.generate.unknown_type`.

## Flags

These flags work in any position (`typeway --json generate model Post`
is the same as `typeway generate model Post --json`).

| Flag | Commands | Meaning |
| --- | --- | --- |
| `--dry-run` | `new`, `generate` | Print the write list; create nothing |
| `--json` | all | One JSON object on stdout (success **and** errors) |
| `--force` | `new`, `generate` | Overwrite existing generated files. Without it, existing files are `skip` |
| `--plural <name>` | `generate` | Override default plural (`Post` → `posts`) |
| `--write-agents` | `generate` | If `AGENTS.md` is missing the managed markers, append the block. Without it, missing markers are `typeway.generate.markers_missing` |
| `--skip-test` | `generate` | Do not run the generated `bun:test` files. Default is to run them and exit 3 on failure (files are left in place) |
| `--workspace` | `new` | Write `workspace:*` for `@typeway/server` and `typeway` |
| `--help` / `-h` | all | Human help; with `--json`, `{ ok, commands }` / `{ ok, command }` |

`--dry-run` on `routes` / `dev` / `build` / `start` / `models` is
`typeway.usage`.

## `--json` write list

```json
{
  "ok": true,
  "dryRun": true,
  "kind": "resource",
  "name": "Post",
  "plural": "posts",
  "writes": [
    { "action": "create", "path": "db/schema/posts.ts" },
    { "action": "update", "path": "db/schema/index.ts" },
    { "action": "skip", "path": "app/models/post.ts", "reason": "exists" }
  ]
}
```

`action` is `create` | `update` | `skip`. `skip` includes `reason`:
`exists` (file already there, no `--force`) or `unchanged` (patch
already converged).

## `typeway models --json`

```json
{
  "ok": true,
  "models": [
    {
      "name": "Post",
      "file": "app/models/post.ts",
      "table": "posts",
      "schema": "db/schema/posts.ts",
      "factory": "db/factories/post.ts"
    }
  ]
}
```

Prefers `.typeway/generate.json`. If that file is missing or has no
models, scans `app/models/*.ts` (skips `*.test.ts`).

## `.typeway/generate.json`

Record of what was generated. `typeway routes --json` uses it to fill
`file` (`GET /api/posts` → `server/routes/posts.ts`). `GET /api/hello`
maps to `server/app.ts` without a manifest entry.

Commit this file. Do not hand-edit it — re-run generate, or delete
the entry and the files together.

## Managed `AGENTS.md`

Generators rewrite **only** the block between
`<!-- typeway:conventions:start -->` and
`<!-- typeway:conventions:end -->`. The inventory inside that block
is regenerated from the manifest (models + resources), never patched
by hand. `llms.txt` gets a matching `<!-- typeway:inventory:* -->`
section.

## Idempotence

- Re-running `generate resource Post title:string body:text` does not
  double-export in `server/app.ts` or `db/schema/index.ts`.
- Existing generated files are skipped unless `--force`.
- A second bootstrap migration is not written if
  `db/migrations/*_create_<plural>/` already exists.
- Exit 0 after a no-op skip run.

## Client-chunk guard (open question 10)

`src/lib/api.ts` is isomorphic. Vite SSR is ESM (`require is not
defined`), so `server/listen.ts` registers
`globalThis.__typewayServerApi` from `src/lib/api.server.ts` (host
graph). The SSR branch of `api()` calls that global; the browser
branch is `treaty(origin)`. The CLI integration test runs
`bun run build:frontend` after `generate resource Post` and asserts
no `bun:sqlite` or `drizzle-orm` in client JS.

## What is not generated

- Auth (`typeway add auth`), jobs, mailers, nested resources
- `--columns` as a separate flag (pass `field:type` args instead)
- Wrapping Vite. `tsr generate` is shelled out, not reimplemented
- Wrapping drizzle-kit for the first migration (hand SQL + snapshot
  is the bootstrap; `bun run db:generate` after you edit the table)

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | `ok: true` |
| 1 | usage / validation |
| 2 | failed to write a file |
| 3 | generated test failed (files left in place) |
