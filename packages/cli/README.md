# typeway

CLI for Typeway apps. The product is conventions, not wrappers: `dev` /
`build` / `start` spawn the app scripts that already exist in
`package.json`. `new` copies an ejectable skeleton.

```sh
bun add -d typeway          # once published
bunx typeway new my-app
cd my-app && bun install
bun run dev                 # or: typeway dev
typeway routes --json
```

From this repo (packages are unpublished):

```sh
bun packages/cli/src/cli.ts new apps/demo --workspace
```

`--workspace` writes `workspace:*` for `@typeway/server` and `typeway`.
Use it when the destination is a Bun workspace member.

## Commands

| Argv | Behaviour |
| --- | --- |
| `typeway new <dir>` | Copy the canonical tree from `templates/app`. Refuse if `<dir>` exists unless `--force`. |
| `typeway new <dir> --dry-run --json` | List writes; create nothing. |
| `typeway dev` | `bun --bun --watch run server.dev.ts`. Forwards `PORT` / `HMR_PORT`. |
| `typeway build` | `bun run build`. |
| `typeway start` | `bun dist/app` after asserting `dist/app` exists. |
| `typeway routes --json` | Import `./server/app.ts`, print the Elysia route table. |
| `typeway --help` | Human text. `--json` prints `{ ok, commands }`. |

`generate model` / `generate resource` are **not** in this package yet.
See [plans/05-cli-and-generators.md](../../plans/05-cli-and-generators.md).

## JSON contract

`--json` always prints one object on stdout, including errors:

```json
{ "ok": false, "error": { "code": "typeway.routes.unreadable", "message": "…", "docs": "https://typeway.dev/errors/typeway.routes.unreadable" } }
```

Exit `0` on `ok: true`, `1` on usage/validation, `2` on a failed write.

Route rows: `{ method, path, file, auth, schemas }`. `file` is `null` until
`.typeway/generate.json` exists. `schemas` is JSON Schema cloned from
Elysia `hooks.query` / `params` / `body` / `headers` / `response`.

## Layout of a generated app

Matches [docs/conventions/layout.md](../../docs/conventions/layout.md):
`app/` `config/` `db/` `server/` `src/`, split `server.dev.ts` /
`server.prod.ts`, load-bearing `src/server.ts`, Drizzle v1 + SQLite,
`GET /api/hello`, a managed `AGENTS.md` block.

CLI source uses tabs (like `@typeway/server`). Generated app files use
spaces (like the playground).
