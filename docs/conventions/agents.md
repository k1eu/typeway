# Agent-first conventions

Agents are a first-class user of a Typeway app. The interface they
get is deterministic files, a managed `AGENTS.md`, JSON on stdout,
and error codes they can grep. Do not make them scrape HTML docs.

## Managed `AGENTS.md`

Every generated app has `AGENTS.md`. Generators rewrite **only**
the block between these markers:

```
<!-- typeway:conventions:start -->
…
<!-- typeway:conventions:end -->
```

Humans (and agents) write above and below. If the markers are
missing, `typeway generate` refuses unless `--write-agents` is
passed (which inserts the block at the end).

The managed block always contains:

```markdown
<!-- typeway:conventions:start -->
## Layout

app/           domain logic. models, context, use cases.
config/        typed configuration. env is validated at boot.
db/            schema and migrations. one table per file.
server/        http. elysia routes, the `backend` instance.
src/           frontend. src/server.ts is the SSR entry — do not rename it.
tests/         process-level integration. unit tests live beside sources.

## Rules

- Models are `app/models/<singular>.ts` and export queries, never a bare table.
  The table lives in `db/schema/`.
- Database access goes through `getDb()`. Never import the connection directly.
- Validation is TypeBox (`import { t } from "elysia"`,
  `import type { Static } from "typebox"`). Do not add a second
  validation library. Infer with `Static<typeof schema>`, not `.static`.
- Domain data goes through Elysia `/api` routes. Pages call them with Eden
  (`src/lib/api.ts`). Do not call models from loaders. Do not put CRUD in
  `createServerFn`.
- Routes are registered on `backend`; anything unmatched is the frontend.
  Do not add a catch-all route.
- Errors are `HTTPError.id("<code>", status)`. Return them from handlers.

## Commands

  bun run dev          api + ssr + hmr, one process
  bun run build        client, ssr, and `dist/app`
  bun test             unit and integration
  typeway routes --json
  typeway models --json
  typeway generate     scaffolds code and this section
<!-- typeway:conventions:end -->
```

`typeway generate model article` appends a one-line inventory
inside the block (`- Article → app/models/article.ts,
db/schema/articles.ts, GET/POST /api/articles` once the resource
exists). The inventory is regenerated from
`typeway models --json` + `typeway routes --json`, never patched by
hand.

`llms.txt` is the same rules without the human README voice,
regenerated in the same pass.

## Docs inside packages

Framework packages keep a README next to the code:

- `packages/connect/README.md` — bridge invariants
- `packages/server/README.md` — `typeway({ app, frontend })`, split
  entries, literal handler import
- `packages/cli/README.md` — argv, JSON schemas, exit codes

Do not add a generated docs site as a prerequisite for the CLI.
App-level knowledge lives in the app. Package-level knowledge
lives in the package. This spec lives in `docs/`.

## Introspection JSON

All commands that an agent might parse accept `--json`. Default
human output is still allowed; `--json` is the contract.

### `typeway routes --json`

```json
{
  "ok": true,
  "routes": [
    {
      "method": "GET",
      "path": "/api/hello",
      "file": "server/app.ts",
      "auth": false
    },
    {
      "method": "GET",
      "path": "/api/articles",
      "file": "server/routes/articles.ts",
      "auth": false
    },
    {
      "method": "POST",
      "path": "/api/articles",
      "file": "server/routes/articles.ts",
      "auth": false
    }
  ]
}
```

Source: Elysia's route table on `backend` (and named auth routes
on the host). `file` is best-effort from the plugin `name` /
source map of the generator manifest `.typeway/generate.json`.
Until that manifest exists, `file` may be `null`.

### `typeway models --json`

```json
{
  "ok": true,
  "models": [
    {
      "name": "Article",
      "file": "app/models/article.ts",
      "table": "articles",
      "schema": "db/schema/articles.ts",
      "factory": "db/factories/article.ts"
    }
  ]
}
```

Scan `app/models/*.ts` (skip `*.test.ts`). Table/schema inferred
from the matching `db/schema/<plural>.ts` or from the generate
manifest.

### Generator `--dry-run --json`

```json
{
  "ok": true,
  "dryRun": true,
  "writes": [
    { "action": "create", "path": "db/schema/articles.ts" },
    { "action": "update", "path": "db/schema/index.ts" },
    { "action": "update", "path": "db/schema/relations.ts" },
    { "action": "create", "path": "app/schemas/article.ts" },
    { "action": "create", "path": "app/models/article.ts" },
    { "action": "create", "path": "app/models/article.test.ts" },
    { "action": "create", "path": "db/factories/article.ts" },
    { "action": "update", "path": "AGENTS.md" },
    { "action": "skip", "path": "app/models/article.ts", "reason": "exists" }
  ]
}
```

`skip` appears only when the file already exists and `--force` was
not passed. Idempotent means a second run without `--force` is all
`skip` plus an `AGENTS.md` rewrite that converges.

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | `ok: true` |
| 1 | usage / validation (`ok: false`, `error.code` set) |
| 2 | failed to write a file |
| 3 | generated test failed when run (generate rolls back? **no** — leave files, print the test output; agents fix forward) |

`--json` errors:

```json
{
  "ok": false,
  "error": {
    "code": "typeway.generate.exists",
    "message": "app/models/article.ts already exists",
    "docs": "https://typeway.dev/errors/typeway.generate.exists",
    "path": "app/models/article.ts"
  }
}
```

## Generator rules

1. **Idempotent.** Same argv twice does not duplicate routes or
   double-export in `server/app.ts`.
2. **`--dry-run` writes nothing.** Combined with `--json` it is the
   planning API.
3. **Always a passing test.** `generate model` writes
   `app/models/<singular>.test.ts`. `generate resource` writes that
   plus `server/routes/<plural>.test.ts`. The generator runs `bun
   test <those files>` before exiting 0.
4. **Rewrite the managed `AGENTS.md` block** in the same pass.
5. **No second validator, no new runtime dependency** without a
   spec amendment.
6. **Do not wrap Vite, drizzle-kit, or bun test.** Shell out, or
   tell the human which script to run (`db:generate`).

## Error codes

Stable strings, dotted, greppable. Framework codes start with
`typeway.`. App codes start with the resource. Catalog:
[docs/errors.md](../errors.md). HTTP responses use Elysia's
problem document (`code` + `type` URL). CLI JSON uses the same
`code` field.
