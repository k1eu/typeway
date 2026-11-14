# The one data path

Domain data has one typed door: **Elysia routes**. Everything else
calls that door through **Eden**. There is no parallel "server
function API" and no "call the model from the loader" path in
generated apps.

```
browser  ──HTTP treaty(origin)──►  Elysia /api/*  ──►  app/models  ──►  getDb()
                 ▲                      ▲
TanStack page ───┘                      │
TanStack loader (client nav) ───────────┘
TanStack loader (SSR) ──in-process treaty(getBackend())──┘
```

The host process is one Bun process. Vite SSR is a **second module
graph** inside that process. In-process Eden still talks to the
**host** `backend` instance, not a Vite-copied Elysia app.

## Decision: in-process on the server, HTTP in the browser

`treaty` from `@elysia/eden` accepts either a URL or an Elysia
instance. An instance calls `app.handle(Request)` — no listen, no
loopback.

| | In-process `treaty(getBackend())` | HTTP `treaty(origin)` |
| --- | --- | --- |
| Browser | Impossible (no instance, would bundle sqlite) | **Yes** — same origin, cookies automatic |
| SSR loader | **Yes** — same ALS as the page request | No — new request, new ALS, must copy `Cookie`, needs `PORT` |
| Request spec | **Yes** — no server | Only for `tests/integration.test.ts` |
| Other clients (curl, mobile) | No | **Yes** — that is why the route exists |

Why not HTTP-to-self from SSR:

1. **ALS.** The marketing and playground pitch is "one request, one
   context". Loopback is a second request. A transaction opened for
   the page would not be the transaction the API sees.
2. **Cookies.** SSR must copy `Cookie` / `Authorization` onto the
   inner fetch. Agents forget; in-process `treaty(app, { headers:
   getRequest().headers })` is mechanical.
3. **PORT.** SSR would need the listen address. Tests already juggle
   random ports.
4. **Two graphs.** The playground's helpers already document that
   Elysia and Vite SSR do not share module state, which is why
   integration tests use a **file** SQLite, not `:memory:`. In-process
   Eden against the **host** instance makes that split irrelevant
   for domain data: Vite never opens its own drizzle client for
   CRUD.

Why not "loaders call `Article.all()`":

- Validation, auth guards, and error codes would run only on the
  HTTP route. The page would silently skip them.
- Eden types would lie: the client of the page is not the client of
  the API.
- Two ways to create a record is how the playground's notes demo
  drifted (`POST /api/notes` **and** `createNote` server fn).

## Decision table

| You need | Use | Do not use |
| --- | --- | --- |
| List / create / update / delete a record | Elysia resource + Eden `api()` from the loader or the browser | `createServerFn`, `Article.all()` in a page |
| JSON for mobile / curl / another service | The same Elysia resource | A second handler |
| Session for `beforeLoad` redirect | `api().api.me.get()` or `auth.api.getSession` inside a **guard** the route already ran | A one-off server fn that reimplements `/api/me` |
| Read a cookie / header to pick a theme, locale, or redirect target that is **not** domain data | TanStack `createServerFn` or `getRequestHeaders()` | An Elysia route |
| Streaming a React tree / `allReady` | TanStack SSR | Elysia |
| better-auth HTTP | Named `/api/auth` + `/api/auth/*` | `.mount(auth.handler)`, TanStack `server.handlers` |
| Multipart upload that is a domain record | Elysia route (`t.File`) + Eden | Server fn |
| Webhook (Stripe, GitHub) | Elysia route, no Eden | A page loader |
| Vite transform / HMR / document | TanStack + `@typeway/server` | Elysia `/api` |

Server functions that touch `getDb()` or a model are a spec
violation. `rg "createServerFn" src` in a generated app should only
hit UI glue.

## The `api()` helper

Loaders import **one** module: `src/lib/api.ts`.

```ts
// src/lib/api.ts
import { treaty } from "@elysia/eden"
import type { Backend } from "../../server/app"

export type Api = ReturnType<typeof treaty<Backend>>

export function api(): Api {
  if (import.meta.env.SSR) {
    // Vite SSR is ESM — `require()` is not defined (open question 10).
    // `server/listen.ts` registers the in-process client on globalThis so
    // this module never imports bun:sqlite into the client graph.
    const serverApi = (globalThis as typeof globalThis & {
      __typewayServerApi?: () => Api
    }).__typewayServerApi
    if (!serverApi) {
      throw new Error("in-process Eden is not wired")
    }
    return serverApi()
  }
  return treaty<Backend>(window.location.origin)
}
```

```ts
// src/lib/api.server.ts
import { treaty } from "@elysia/eden"
import { getBackend, getRequest } from "../../app/context"

export function api() {
  const headers = getRequest()?.headers
  return treaty(getBackend(), headers ? { headers } : undefined)
}
```

`require` in the SSR branch is intentional: it is a Vite
compile-time dead branch on the client. The generator ships a test
that the client chunk does not contain `bun:sqlite` or `drizzle`
(open question 10 in the hub — if this fails, split the loader
instead of weakening the rule).

Page:

```tsx
// src/routes/articles/index.tsx
import { createFileRoute } from "@tanstack/react-router"
import { api } from "../../lib/api"

export const Route = createFileRoute("/articles/")({
  loader: async () => {
    const { data, error } = await api().api.articles.get()
    if (error) throw error
    return data
  },
  component: ArticlesIndex,
})

function ArticlesIndex() {
  const articles = Route.useLoaderData()
  return (
    <ul>
      {articles.map((article) => (
        <li key={article.id}>{article.title}</li>
      ))}
    </ul>
  )
}
```

Create from the browser uses the same client (HTTP):

```ts
const { data, error } = await api().api.articles.post({
  title: draft.title,
  body: draft.body,
})
```

Treaty paths include the `/api` prefix when the base URL is the
origin and `backend` is `new Elysia({ prefix: "/api" })`. See hub
open question 1 — lock the exact property chain with a CLI fixture
before generating pages. Until then, snippets use
`api().api.articles.get()`.

## Putting the host `backend` in ALS

Vite SSR cannot `import { backend } from "../../server/app"` and
treaty **that** copy. That copy has its own drizzle client, its own
ALS, and would re-run `ensureSchema()`.

The host boot file already has the instance. `listen` puts it on
the context:

```ts
// server/fetch-context.ts (target shape)
import type { Backend } from "./app"
import { db as rootDb } from "../config/database"
import { runWithContext, type AppContext } from "../app/context"

export async function buildAppContext(
  request: Request,
  backend: Backend,
): Promise<AppContext> {
  return { db: rootDb, txDepth: 0, request, backend }
}

export async function withFetchContext(
  request: Request,
  backend: Backend,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  const ctx = await buildAppContext(request, backend)
  return runWithContext(ctx, handler)
}
```

`getBackend()` throws if called outside a request (tests wrap with
`runWithContext`). Request specs pass the same `backend` they
treaty.

ALS itself is process-global:

```ts
const g = globalThis as typeof globalThis & {
  __typewayContext?: AsyncLocalStorage<AppContext>
}
const storage = (g.__typewayContext ??= new AsyncLocalStorage<AppContext>())
```

Without that singleton, `listen.ts` (Bun graph) and
`app/context.ts` (Vite graph) are two `AsyncLocalStorage` instances,
and SSR `getDb()` falls back to the pool. That is why the current
playground can demo "shared notes" only via a shared **file**.

## What server functions are still for

Keep `createServerFn` for things that are **not** a resource:

- Reading `getRequestHeaders()` to decide a redirect in `beforeLoad`
  when `/api/me` would be heavier than you want on every navigation
  **and** you are not loading domain rows. Prefer `/api/me` once it
  exists.
- Prefetching that only shapes UI (e.g. a rendering-mode probe).
- Calling `notFound()` / `redirect()` after an Eden error so the
  document status matches.

The `/rendering/*` demo pages may keep a local server fn that stamps
`loadedAt` / `source`. That is UI. They must not insert rows.

## Playground

Notes pages call `api().api.notes` (in-process treaty on SSR, HTTP
in the browser). `src/data/session.ts` still uses `createServerFn`
for Better Auth UI glue — that is allowed. Domain CRUD does not.
