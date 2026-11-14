# `typeway` CLI

Slice 1 of [plan 05](../plans/05-cli-and-generators.md). Generators are
the next PR.

The bin lives in [`packages/cli`](../packages/cli). Package name
`typeway`, executable `typeway`. Apps keep `bun run dev` / `build` /
`start`; the CLI commands of the same name are thin aliases.

```sh
typeway new my-app
cd my-app && bun install
bun run dev                 # typeway dev
typeway routes --json
```

Inside this monorepo, pass `--workspace` so the scaffold depends on
`@typeway/server` and `typeway` via `workspace:*`.

## Commands

See [`packages/cli/README.md`](../packages/cli/README.md) for the argv
table, JSON schemas, and exit codes. `typeway <command> --help` prints
the same information; `typeway --help --json` is `{ ok, commands }`.

Global conventions (from [agents](./conventions/agents.md)):

- `--json` machine output on stdout (success **and** errors)
- `--dry-run` where the command writes files (`new`)
- Deterministic output (sorted write lists, routes sorted by path then method)
- Error `code` + `docs` URL (`https://typeway.dev/errors/<code>`)
- Catalog: [errors.md](./errors.md)

## `typeway new`

Copies `packages/cli/templates/app` with `{{name}}` substitution. The
tree is the spec in [layout.md](./conventions/layout.md) minus
jobs/mailers bodies (`.gitkeep`) and minus auth files. Hook points stay
as comments (`typeway add auth: .use(authPlugin)` on the host).

`--dry-run --json` lists writes and creates nothing. Existing `<dir>` is
refused unless `--force`.

The skeleton is required to `bun check`, `bun test`, `bun run dev`,
`bun run build`, and `bun run start`. `GET /api/hello` is the JSON
probe; `GET /` is TanStack SSR (`src/server.ts` is load-bearing).

## `typeway routes`

Imports `server/app.ts` from cwd and reads Elysia 2 RC
`backend.routes[]` (`method`, `path`, `hooks`). Confirmed shape lives in
`packages/cli/src/routes.test.ts`. `file` is `null` until generate
writes `.typeway/generate.json`.

Human output is a `METHOD  PATH  FILE` table.

## Not yet

- `typeway generate model` / `generate resource` / `models --json`
- `typeway add auth`, jobs, mailers, `db migrate`, `console`
- Wrapping Vite, TanStack's plugin, or drizzle-kit
