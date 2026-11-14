# Testing conventions

`bun:test` is the runner. Three layers, three places. A generator
that cannot emit a passing test at the layer it touched is not
done.

| Layer | File | Boots HTTP? | Database |
| --- | --- | --- | --- |
| Unit | `app/models/<singular>.test.ts` | No | pool / `:memory:` |
| Request spec | `server/routes/<plural>.test.ts` | No — `treaty(backend)` | pool / `:memory:` + ALS |
| Integration | `tests/integration.test.ts` | Yes — real `server.dev.ts` / `dist/app` | **file** SQLite |

## Unit

Next to the source. Import the model, hit `getDb()` (default
context is the pool). Truncate in `afterEach`.

```ts
import { afterEach, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { db } from "../../config/database"
import { Article } from "./article"
import { articleFactory } from "../../db/factories/article"
import { transaction } from "../transaction"

afterEach(() => {
  db.run(sql`DELETE FROM articles`)
})

describe("Article", () => {
  test("factory round-trip", () => {
    const row = articleFactory({ title: "factory" })
    expect(Article.find(row.id)?.title).toBe("factory")
  })

  test("nested transaction sees inserts", () => {
    transaction(() => {
      articleFactory({ title: "inside" })
      expect(Article.all().some((a) => a.title === "inside")).toBe(true)
    })
  })
})
```

Do not `listen()`. Do not `fetch()`. If a unit test needs a Request
(auth), wrap with `runWithContext({ db: rootDb, txDepth: 0, request
})`.

## Request specs (Eden)

This is the typed contract of a resource. In-process Treaty against
the same `backend` the host uses. No port, no Vite.

```ts
// server/routes/articles.test.ts
import { afterEach, describe, expect, test } from "bun:test"
import { treaty } from "@elysia/eden"
import { sql } from "drizzle-orm"
import { db } from "../../config/database"
import { runWithContext } from "../../app/context"
import { articleFactory } from "../../db/factories/article"
import { backend } from "../app"

const api = treaty(backend)

afterEach(() => {
  db.run(sql`DELETE FROM articles`)
})

function withApp<T>(fn: () => T): T {
  return runWithContext({ db, txDepth: 0, backend }, fn)
}

describe("POST /api/articles", () => {
  test("creates", async () => {
    const { data, error } = await withApp(() =>
      api.api.articles.post({ title: "Hi", body: "there" }),
    )
    expect(error).toBeNull()
    expect(data?.title).toBe("Hi")
  })

  test("rejects empty title", async () => {
    const { error } = await withApp(() =>
      api.api.articles.post({ title: "", body: "x" }),
    )
    expect(error?.status).toBe(422)
  })
})

describe("GET /api/articles/:id", () => {
  test("404 is article.not_found", async () => {
    const { error } = await withApp(() => api.api.articles({ id: 999 }).get())
    expect(error?.status).toBe(404)
    expect(error?.value).toMatchObject({ code: "article.not_found" })
  })
})
```

`generate resource` writes at least: index empty / index with a
factory row, create happy path, create validation 422, show 404.
That file must pass with `bun test server/routes/articles.test.ts`
on a fresh generate.

Auth: pass a `Request` with a session cookie in context, or call
`auth.api.signUp` against the same in-process handler first. Do not
boot the page.

The exact Treaty chain (`api.api.articles` vs `api.articles`) is
hub open question 1. The generator fixture freezes it; this file
follows the fixture, not a guess.

## Factories

`db/factories/<singular>.ts`. Insert via `getDb()`. Override with a
partial. No Faker.js unless the app adds it. Defaults are short
ASCII so tests stay greppable (`title: "Untitled"`).

Factories are for tests and development seeds. Production code
paths call `Article.create`.

## Isolation

- **In-process** (unit + request spec): `DATABASE_URL=:memory:` is
  fine. One connection, one graph.
- **Vite SSR involved**: `:memory:` is per connection. Use a temp
  file. `tests/helpers.ts` in the playground already does this.
- Truncate tables in `afterEach`, do not drop the schema.
  `ensureSchema()` runs at import.
- Parallel `bun test` files that boot servers each pick a free
  `PORT` and `HMR_PORT`. Copy the playground helper; do not share
  port 3000.
- Do not assert `Content-Type: text/css` in dev (Vite serves CSS
  as JS). Do not assume HMR shares the app port.

## Integration

`tests/` boots the real process. Assert the host contract, not
every resource:

- `GET /api/hello` JSON, registered route wins.
- `GET /` is an SSR document (`<!DOCTYPE html`, `$_TSR`).
- `GET /api/<resource>` after a POST is visible to a subsequent GET.
- Prod: prerendered SSG URLs do not fall through to SSR if the app
  has any.

Resource coverage belongs in the Eden spec next to the route, so
it runs without a 90s Vite boot. Integration is for glue.

## What not to test

- TanStack `routeTree.gen.ts`.
- drizzle-kit snapshots.
- `@typeway/connect` behaviour from an app — that suite lives in
  `packages/connect/src/index.test.ts`.
- Streaming SSR without `BROWSER_UA`. Bun's default UA is a bot;
  TanStack waits for `allReady`. See AGENTS.md.
