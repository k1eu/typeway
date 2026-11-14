# App directory layout

Every generated Typeway app looks like this. Names are the convention;
do not invent synonyms (`controllers/`, `lib/models`, `prisma/`).

Frontend path aliases (`#/*`, `@/*` → `src/`) are allowed because
TanStack already uses them. Backend and `app/` imports stay
**relative** so `rg "app/models/article"` stays true.

## Root

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Agent-facing conventions. Managed block is generated; see [agents](./agents.md). |
| `README.md` | Humans. Commands, what the app is. |
| `llms.txt` | Compact dump of layout + rules. Regenerated with `AGENTS.md`. |
| `package.json` | `dev` / `build` / `start` / `test` scripts. `typeway` is a devDependency. |
| `tsconfig.json` | `strict: true`, `moduleResolution: "bundler"`. Eden needs strict. |
| `bunfig.toml` | `preload` only if tests need one. Do not hide config here. |
| `drizzle.config.ts` | `schema: "./db/schema/index.ts"`, `out: "./db/migrations"`, dialect from `config/env.ts`. |
| `vite.config.ts` | TanStack plugin, React, Tailwind. Prerender via `pages`. |
| `tsr.config.json` | TanStack Router CLI. Leave the defaults. |
| `server.dev.ts` | `import { typeway, tanstack } from "@typeway/server/dev"`. |
| `server.prod.ts` | `import { typeway, tanstack } from "@typeway/server"`. Literal `import("./dist/server/server.js")`. |

`server.dev.ts` and `server.prod.ts` stay this small:

```ts
// server.dev.ts
import { tanstack, typeway } from "@typeway/server/dev"
import { Elysia } from "elysia"
import { backend } from "./server/app"
import { listen } from "./server/listen"

await typeway({
  app: new Elysia().use(backend),
  frontend: tanstack(),
  serve: listen,
}).dev()
```

```ts
// server.prod.ts
import { tanstack, typeway } from "@typeway/server"
import { Elysia } from "elysia"
import { backend } from "./server/app"
import { listen } from "./server/listen"

// Specifier must stay literal — bun build --target bun inlines it.
// @ts-ignore built output only exists after `bun run build`
const { default: handler } = await import("./dist/server/server.js")

await typeway({
  app: new Elysia().use(backend),
  frontend: tanstack({ handler }),
  serve: listen,
}).prod()
```

Do not re-export `@typeway/server/dev` from a barrel the prod file
imports. See `packages/server/README.md`.

## `app/` — domain

| Path | Purpose | Naming |
| --- | --- | --- |
| `app/context.ts` | `AsyncLocalStorage` singleton on `globalThis`. `getDb`, `getBackend`, `getRequest`, `runWithContext`. | Do not rename. |
| `app/transaction.ts` | Rails-like `transaction(fn)`. Nested calls join. | Do not rename. |
| `app/errors.ts` | `HTTPError.typeBase` and shared error classes. | Do not rename. |
| `app/models/<singular>.ts` | Query object. No tables, no HTTP. | `article.ts`, export `Article`. |
| `app/models/<singular>.test.ts` | Unit tests. | Same stem as the model. |
| `app/schemas/<singular>.ts` | TypeBox `t.Object` for input/output. | `ArticleCreate`, `ArticleParams`, `Article`. |
| `app/jobs/` | Reserved. | `<verb><object>.ts` later (`deliverInvoice.ts`). |
| `app/mailers/` | Reserved. | `<name>Mailer.ts` later. |

A model module **exports queries, never a bare table**. The table
lives in `db/schema/`.

## `config/`

| Path | Purpose |
| --- | --- |
| `config/env.ts` | TypeBox schema + parsed `env`. Throws at import if invalid. |
| `config/database.ts` | `sqlite` handle, `db`, `ensureSchema()`, development seed. |
| `config/application.ts` | `{ env, db, auth, … }` merged with the environment file. |
| `config/environments/development.ts` | Non-secrets: log level, seed-on-boot, etc. |
| `config/environments/test.ts` | `DATABASE_URL` default `:memory:` for in-process tests. |
| `config/environments/production.ts` | No default secrets. |

Secrets only in env, never in environment files.

## `db/`

| Path | Purpose | Naming |
| --- | --- | --- |
| `db/schema/<plural>.ts` | One Drizzle `sqliteTable` (or later `pgTable`). | File = table = `articles`. |
| `db/schema/auth.ts` | Better Auth tables. Generated. Do not edit. | Only present after `typeway add auth`. |
| `db/schema/relations.ts` | `defineRelations(schema, …)`. | One file for the whole app. |
| `db/schema/index.ts` | `export *` of tables + `relations`. | Drizzle-kit `schema` points here. |
| `db/migrations/<YYYYMMDDHHMMSS>_<name>/` | drizzle-kit v1 folder: `migration.sql` + `snapshot.json`. | Never hand-edit snapshots. |
| `db/seeds/development.ts` | Idempotent `seed()`. | Called from `config/database.ts` when `env.NODE_ENV === "development"`. |
| `db/factories/<singular>.ts` | `articleFactory(overrides)`. | Inserts via `getDb()`. |

The playground still has `db/schema.ts` and `drizzle/` at the app
root. Generated apps use this layout; do not add a third variant.

## `server/` — HTTP

| Path | Purpose |
| --- | --- |
| `server/app.ts` | Compose plugins. `export const backend`. `export type Backend = typeof backend`. Prefix `/api`. |
| `server/listen.ts` | `Bun.serve` whose `fetch` calls `withFetchContext`. Replaces `app.listen`. |
| `server/fetch-context.ts` | `buildAppContext(request)` → `{ db, txDepth, request, backend }`. |
| `server/auth.ts` | `betterAuth({ … })`. Only after `add auth`. |
| `server/auth-plugin.ts` | Named `/api/auth` and `/api/auth/*` — not `.mount()`. |
| `server/guards/auth.ts` | `.derive` that returns `{ session }` or `Unauthenticated`. |
| `server/routes/<plural>.ts` | Resource plugin, prefix `/<plural>`. |
| `server/routes/<plural>.test.ts` | Eden request spec. |

Host construction (boot files):

```ts
new Elysia().use(authPlugin).use(backend)
```

Auth plugin is registered on the host, not inside `backend`, so
`/api/auth/*` stays a named route ahead of the connect wildcard.
`backend` is the typed JSON API Eden sees.

## `src/` — frontend

| Path | Purpose |
| --- | --- |
| `src/server.ts` | TanStack SSR entry. **Do not rename.** |
| `src/router.tsx` | `getRouter()`. |
| `src/routeTree.gen.ts` | Router CLI output. |
| `src/styles.css` | Tailwind entry. |
| `src/lib/api.ts` | Isomorphic Eden helper. Loaders import only this. |
| `src/lib/api.server.ts` | `treaty(getBackend())`. Never imported from client-only modules. |
| `src/lib/auth-client.ts` | `createAuthClient()`. Same-origin `/api/auth`. |
| `src/routes/__root.tsx` | Shell, head, `<Scripts />`. |
| `src/routes/index.tsx` | `/`. |
| `src/routes/<plural>/index.tsx` | Index page. Loader calls `api()`. |
| `src/routes/<plural>/$id.tsx` | Show page. |
| `src/components/` | Presentational. PascalCase files. |

JSON does **not** live in `src/routes`. TanStack `server.handlers`
and `src/data/*` server functions are not the domain API.

`src/server.ts` stays a thin fetch wrapper so the same module runs
in dev (Vite SSR runner) and prod (built `dist/server/server.js`):

```ts
import handler, { createServerEntry } from "@tanstack/react-start/server-entry"

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request)
  },
})
```

## `tests/`

| Path | Purpose |
| --- | --- |
| `tests/helpers.ts` | Random `PORT` / `HMR_PORT`, temp `DATABASE_URL` file, spawn/kill. |
| `tests/integration.test.ts` | Smoke: `/api/*` bypasses the bridge, `/` is SSR. |

No unit tests here. No factories here.

## Naming rules

| Thing | Rule | Example |
| --- | --- | --- |
| Model file | singular, kebab-case if multiword | `app/models/invoice-item.ts` |
| Model export | PascalCase singular | `InvoiceItem` |
| Table / schema file | plural snake in SQL, plural kebab in file | `db/schema/invoice-items.ts`, table `invoice_items` |
| TypeBox schema file | singular, matches the model | `app/schemas/invoice-item.ts` |
| TypeBox exports | PascalCase + suffix | `InvoiceItemCreate`, `InvoiceItemParams` |
| Route file | plural | `server/routes/invoice-items.ts` |
| Route plugin export | camelCase + `Api` | `invoiceItemsApi` |
| Page route | plural, TanStack file routing | `src/routes/invoice-items/index.tsx` |
| Factory | singular + `Factory` | `invoiceItemFactory` |
| Error `code` | `resource.reason` or `typeway.*` | `invoice_item.not_found` |
| Test file | `<stem>.test.ts` next to source | `article.test.ts` |

Generator default plural is `name + "s"`. Irregulars take
`--plural`. Do not add an inflection library.

## What does not exist

- `app/controllers/` — Elysia route files are the controllers.
- `src/data/` / `src/mutations/` for domain records — those folders
  in the playground are the anti-pattern this spec replaces.
- A Typeway ORM, router, or env wrapper package. Glue stays in the
  app, copied by the generator, ejectable by deleting files.
