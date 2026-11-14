# Models

A model is a file of queries over a Drizzle table, scoped by
`getDb()`. It is not an ActiveRecord class, not a repository
framework, and not a Zod schema. The generator writes four files
and stops:

1. `db/schema/<plural>.ts` — table
2. `db/schema/relations.ts` — updated `defineRelations`
3. `app/schemas/<singular>.ts` — TypeBox
4. `app/models/<singular>.ts` — queries
5. `db/factories/<singular>.ts` — insert helper
6. `app/models/<singular>.test.ts` — passing unit test

(`generate resource` then adds HTTP. `generate model` does not.)

## Tables

One table per file. SQL name is snake_plural. File name is
kebab-plural.

```ts
// db/schema/articles.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const articles = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
})

export type ArticleRow = typeof articles.$inferSelect
export type NewArticleRow = typeof articles.$inferInsert
```

```ts
// db/schema/index.ts
export * from "./articles"
export { relations } from "./relations"
```

Better Auth tables are generated into `db/schema/auth.ts` and
re-exported here. Do not hand-edit them. Strip any 0.x
`relations()` the CLI still emits (see playground
`db/auth.schema.ts`).

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit"
import { env } from "./config/env"

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: env.DATABASE_URL },
})
```

Migrations are drizzle-kit v1 folders
(`db/migrations/YYYYMMDDHHMMSS_name/{migration.sql,snapshot.json}`).
Apps run `bun run db:generate` (drizzle-kit) after changing a
table. `typeway generate model` does **not** wrap drizzle-kit; it
writes the table file and tells you to generate.

## Relations (Drizzle v1)

One file. `defineRelations` from `drizzle-orm`, not
`relations()` from 0.x.

```ts
// db/schema/relations.ts
import { defineRelations } from "drizzle-orm"
import * as schema from "./index"

export const relations = defineRelations(schema, (r) => ({
  articles: {
    // example once comments exist:
    // comments: r.many.comments(),
  },
}))
```

```ts
// config/database.ts (excerpt)
import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database } from "bun:sqlite"
import { relations } from "../db/schema/relations"
import { env } from "./env"

export const sqlite = new Database(env.DATABASE_URL)
export const db = drizzle({ client: sqlite, relations })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
```

Without `{ relations }`, `getDb().query.articles` does not exist.
The playground currently calls `drizzle({ client: sqlite })` and
never uses `db.query`; generated apps always pass `relations`.

`r.one.users({ from: r.articles.authorId, to: r.users.id })` is the
v1 shape. Do not go back to 0.x `relations(articles, ({ one }) =>
…)`.

## TypeBox schemas

Elysia's `t` is TypeBox. Put HTTP-facing shapes next to the model,
not in the table file (SQL is not JSON validation).

```ts
// app/schemas/article.ts
import { t } from "elysia"
import type { Static } from "typebox"

export const ArticleCreate = t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  body: t.String({ minLength: 1 }),
})
export type ArticleCreate = Static<typeof ArticleCreate>

export const ArticleUpdate = t.Partial(ArticleCreate)
export type ArticleUpdate = Static<typeof ArticleUpdate>

export const ArticleParams = t.Object({
  id: t.Number(),
})
export type ArticleParams = Static<typeof ArticleParams>

export const Article = t.Object({
  id: t.Number(),
  title: t.String(),
  body: t.String(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
})
export type Article = Static<typeof Article>
```

Elysia 2's TypeBox is the `typebox` package (v1). Infer with
`Static<typeof schema>` — there is no `.static` property (that was
TypeBox 0.x / Elysia 1). Do not add `@sinclair/typebox`; `typebox`
comes in with Elysia. Generated apps may list `typebox` as a direct
dependency so the import is not a transitive ghost.

Routes import these as `body`, `params`, `response`. Models accept
`ArticleCreate` rather than `NewArticleRow` so a job and a route
cannot drift. Drizzle `$inferInsert` may contain extra columns
(`id`, timestamps); the TypeBox input is the public write shape.

Do not add `zod`, `valibot`, or `@sinclair/typebox` as an app
dependency. `import { t } from "elysia"` is the one validator.

## Model module

```ts
// app/models/article.ts
import { desc, eq } from "drizzle-orm"
import { getDb } from "../context"
import { articles, type ArticleRow } from "../../db/schema/articles"
import type { ArticleCreate, ArticleUpdate } from "../schemas/article"

export const Article = {
  all(): ArticleRow[] {
    return getDb()
      .select()
      .from(articles)
      .orderBy(desc(articles.createdAt))
      .all()
  },

  find(id: number): ArticleRow | undefined {
    return getDb().select().from(articles).where(eq(articles.id, id)).get()
  },

  create(input: ArticleCreate): ArticleRow {
    return getDb().insert(articles).values(input).returning().get()
  },

  update(id: number, input: ArticleUpdate): ArticleRow | undefined {
    return getDb()
      .update(articles)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(articles.id, id))
      .returning()
      .get()
  },

  destroy(id: number): ArticleRow | undefined {
    return getDb()
      .delete(articles)
      .where(eq(articles.id, id))
      .returning()
      .get()
  },
}
```

Rules:

- Export a const object, PascalCase singular. Not a class. Not
  `export default`.
- Every method goes through `getDb()`. Never `import { db } from
  "../../config/database"` in a model — that skips the request
  transaction.
- Return the row type (`ArticleRow`). Routes may still declare a
  TypeBox `response` that Eden sees.
- Use `getDb().query.articles.findMany({ with: { comments: true }
  })` when loading relations. Use the query builder (`select /
  insert`) for writes and simple reads. Do not wrap either in a
  Typeway helper.
- bun-sqlite is **sync** (`.all()` / `.get()`). Do not `async` a
  model method that is not actually async — drizzle-orm 1.x rejects
  async callbacks inside sqlite transactions.

## Per-request db and transactions

```ts
// app/context.ts
import { AsyncLocalStorage } from "node:async_hooks"
import { db as rootDb, type Db, type Tx } from "../config/database"
import type { Backend } from "../server/app"

export type AppContext = {
  db: Db | Tx
  txDepth: number
  request?: Request
  backend?: Backend
}

const g = globalThis as typeof globalThis & {
  __typewayContext?: AsyncLocalStorage<AppContext>
}
const storage = (g.__typewayContext ??= new AsyncLocalStorage<AppContext>())

const defaultContext = (): AppContext => ({ db: rootDb, txDepth: 0 })

export function getContext(): AppContext {
  return storage.getStore() ?? defaultContext()
}

export function getDb(): Db | Tx {
  return getContext().db
}

export function getRequest(): Request | undefined {
  return getContext().request
}

export function getBackend(): Backend {
  const backend = getContext().backend
  if (!backend) {
    throw new Error("getBackend() called outside a request — wrap with runWithContext")
  }
  return backend
}

export function runWithContext<T>(ctx: AppContext, fn: () => T): T {
  return storage.run(ctx, fn)
}
```

`globalThis.__typewayContext` is load-bearing. Vite SSR and the Bun
host must share one `AsyncLocalStorage`. A module-local `new
AsyncLocalStorage()` is a second store.

```ts
// app/transaction.ts
import { db as rootDb, type Tx } from "../config/database"
import { getContext, runWithContext } from "./context"

/**
 * Nested calls reuse the outer transaction. getDb() is the tx client
 * inside. Sync: bun-sqlite rejects async transaction callbacks.
 */
export function transaction<T>(fn: () => T): T {
  const ctx = getContext()
  if (ctx.txDepth > 0) return fn()

  const run = rootDb.transaction.bind(rootDb) as (
    transaction: (tx: Tx) => T,
  ) => T
  return run((tx) =>
    runWithContext({ ...ctx, db: tx, txDepth: ctx.txDepth + 1 }, fn),
  )
}
```

Use `transaction()` around multiple model calls that must commit
together. Routes that do a single `Article.create` do not need it.
There are no savepoints yet (hub open question 5).

## Factories and seeds

```ts
// db/factories/article.ts
import { getDb } from "../../app/context"
import { articles, type NewArticleRow } from "../schema/articles"
import type { ArticleRow } from "../schema/articles"

export function articleFactory(
  overrides: Partial<NewArticleRow> = {},
): ArticleRow {
  return getDb()
    .insert(articles)
    .values({
      title: "Untitled",
      body: "lorem ipsum",
      ...overrides,
    })
    .returning()
    .get()
}
```

Factories go through `getDb()` so they participate in a test
transaction. They skip TypeBox on purpose (tests need invalid rows
sometimes). Routes never call factories.

```ts
// db/seeds/development.ts
import { Article } from "../../app/models/article"
import { articleFactory } from "../factories/article"

export function seed() {
  if (Article.all().length > 0) return
  articleFactory({ title: "Hello from SQLite" })
}
```

`config/database.ts` calls `seed()` only when
`env.NODE_ENV === "development"`. Tests insert via factories.

## Unit test the generator always writes

```ts
// app/models/article.test.ts
import { afterEach, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { db } from "../../config/database"
import { Article } from "./article"

afterEach(() => {
  db.run(sql`DELETE FROM articles`)
})

describe("Article", () => {
  test("create then all", () => {
    const row = Article.create({ title: "Hi", body: "there" })
    expect(row.title).toBe("Hi")
    expect(Article.all().map((a) => a.id)).toContain(row.id)
  })
})
```

This test must pass on a fresh `generate model` with no further
edits. It uses the default context (pool), not ALS, which is
correct for unit tests.
