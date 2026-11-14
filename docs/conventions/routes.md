# Routes

Elysia is the JSON API. TanStack is the document. They share a
process and they do not share a URL namespace:

| | Path | File |
| --- | --- | --- |
| HTML index | `GET /articles` | `src/routes/articles/index.tsx` |
| HTML show | `GET /articles/1` | `src/routes/articles/$id.tsx` |
| JSON index | `GET /api/articles` | `server/routes/articles.ts` |
| JSON create | `POST /api/articles` | same |
| JSON show | `GET /api/articles/1` | same |
| JSON update | `PATCH /api/articles/1` | same |
| JSON destroy | `DELETE /api/articles/1` | same |

Do not add `new` / `edit` JSON actions. Do not put JSON handlers on
the TanStack route's `server.handlers`.

## Resource file

Elysia 2: **config second, handler third.** Method-chain so Eden
keeps the type.

```ts
// server/routes/articles.ts
import { Elysia } from "elysia"
import { Article } from "../../app/models/article"
import { ArticleNotFound } from "../../app/errors"
import {
  Article as ArticleSchema,
  ArticleCreate,
  ArticleParams,
  ArticleUpdate,
} from "../../app/schemas/article"
import { authGuard } from "../guards/auth"

export const articlesApi = new Elysia({ prefix: "/articles" })
  .get(
    "/",
    { response: t.Array(ArticleSchema) },
    () => Article.all(),
  )
  .post(
    "/",
    { body: ArticleCreate, response: ArticleSchema },
    ({ body }) => Article.create(body),
  )
  .use(authGuard)
  .patch(
    "/:id",
    { params: ArticleParams, body: ArticleUpdate, response: ArticleSchema },
    ({ params, body }) => {
      const row = Article.update(params.id, body)
      if (!row) return new ArticleNotFound(params.id)
      return row
    },
  )
```

Keep the first version of the generator simpler than the `guard`
nesting above: all five actions in one plugin, `auth: true` only on
write actions via `.use(authGuard)` on a nested plugin.

Minimal resource the generator emits:

```ts
import { Elysia } from "elysia"
import { Article } from "../../app/models/article"
import { ArticleNotFound } from "../../app/errors"
import {
  Article as ArticleSchema,
  ArticleCreate,
  ArticleParams,
  ArticleUpdate,
} from "../../app/schemas/article"

export const articlesApi = new Elysia({ prefix: "/articles" })
  .get("/", { response: t.Array(ArticleSchema) }, () => Article.all())
  .post("/", { body: ArticleCreate, response: ArticleSchema }, ({ body }) =>
    Article.create(body),
  )
  .get("/:id", { params: ArticleParams, response: ArticleSchema }, ({ params }) => {
    const row = Article.find(params.id)
    if (!row) return new ArticleNotFound(params.id)
    return row
  })
  .patch(
    "/:id",
    { params: ArticleParams, body: ArticleUpdate, response: ArticleSchema },
    ({ params, body }) => {
      const row = Article.update(params.id, body)
      if (!row) return new ArticleNotFound(params.id)
      return row
    },
  )
  .delete("/:id", { params: ArticleParams, response: ArticleSchema }, ({ params }) => {
    const row = Article.destroy(params.id)
    if (!row) return new ArticleNotFound(params.id)
    return row
  })
```

Need `import { t } from "elysia"` when using `t.Array`. Prefer
importing the already-built TypeBox objects from `app/schemas`.

Member extras (`POST /api/articles/:id/publish`) live in the same
file, after the five actions, named in the method:

```ts
.post("/:id/publish", { params: ArticleParams }, ({ params }) => {
  return Article.publish(params.id)
})
```

Nested resources (`/api/articles/:articleId/comments`) are a
separate file `server/routes/comments.ts` with prefix
`/articles/:articleId/comments`. Do not deeply nest plugins across
files.

## App composition

```ts
// server/app.ts
import { Elysia, t, HTTPError } from "elysia"
import { articlesApi } from "./routes/articles"

HTTPError.typeBase = "https://typeway.dev/errors"

export const backend = new Elysia({ prefix: "/api" })
  .get(
    "/hello",
    {
      query: t.Object({
        name: t.Optional(t.String()),
      }),
    },
    ({ query }) => ({ message: `Hello ${query.name ?? "world"}` }),
  )
  .use(articlesApi)

export type Backend = typeof backend
```

Rules:

- `export type Backend = typeof backend` is required. Browser Eden
  imports the **type only**.
- Method-chain `.use(...)`. Reassigning `let app = app.use(...)`
  drops types.
- Do not `.all("*")` here. The frontend adapter owns the catch-all.
- `GET /api/hello` stays as the smoke probe (`curl` in AGENTS.md).

Host (boot files) composes auth **outside** `backend` so named
`/api/auth` routes exist on the same Elysia instance that mounts
the connect wildcard, and win:

```ts
new Elysia().use(authPlugin).use(backend)
```

## Auth guards

better-auth is not a Typeway wrapper. The playground already has
the important constraint: **do not `.mount(auth.handler)`**. Mount
registers a catch-all; `@typeway/connect`'s `*` wins; auth HTML
falls through to TanStack.

```ts
// server/auth-plugin.ts
import { Elysia } from "elysia"
import { auth } from "./auth"

export const authPlugin = new Elysia({ name: "better-auth" })
  .all("/api/auth", ({ request }) => auth.handler(request))
  .all("/api/auth/*", ({ request }) => auth.handler(request))
```

Guard for JSON routes:

```ts
// server/guards/auth.ts
import { Elysia } from "elysia"
import { auth } from "../auth"
import { Unauthenticated } from "../../app/errors"

export const authGuard = new Elysia({ name: "auth-guard" }).derive(
  async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) return new Unauthenticated()
    return { session }
  },
)
```

Elysia 2 prefers **returning** errors over throwing so Eden sees
the status. If `.derive` returning an `HTTPError` is not treated as
a response (verify in the resource generator's fixture), throw
instead and map with `.onError(Unauthenticated, …)`. Record the
working shape in the fixture; do not ship both.

Write routes `.use(authGuard)` so `session` is in context. Read
routes stay public unless the resource is private (`generate
resource --auth` later).

`GET /api/me` stays the session probe:

```ts
.get("/me", async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return new Unauthenticated()
  return { user: session.user }
})
```

Pages that must redirect to `/login` call this via Eden in
`beforeLoad`, or call `auth.api.getSession` only as UI glue. Do not
duplicate authorization logic that the JSON route already enforces
— the route is the source of truth when the same user hits the API
from curl.

## Errors

Use Elysia's `HTTPError.id`. Do not invent `{ error: { code } }`
beside it. RFC 9457 problem documents are what Elysia 2 already
returns; `code` is greppable; `type` becomes
`https://typeway.dev/errors/<code>` when `typeBase` is set.

```ts
// app/errors.ts
import { HTTPError } from "elysia"

HTTPError.typeBase = "https://typeway.dev/errors"

export class Unauthenticated extends HTTPError.id(
  "typeway.auth.unauthenticated",
  401,
) {
  constructor() {
    super("Sign in to continue")
  }
}

export class Forbidden extends HTTPError.id("typeway.auth.forbidden", 403) {
  constructor() {
    super("You cannot perform this action")
  }
}

export class ArticleNotFound extends HTTPError.id("article.not_found", 404) {
  constructor(id: number) {
    super(`Article ${id} was not found`)
  }
}
```

Handlers **return** the instance:

```ts
const row = Article.find(params.id)
if (!row) return new ArticleNotFound(params.id)
return row
```

Returned errors participate in the route's response type; Eden
narrows `error.status === 404`. Thrown errors work at runtime but
are weaker for Treaty.

Validation failures stay Elysia's `ValidationError` (`code:
"validation"`, status 422). Do not catch and rewrap them.

Catalog: [docs/errors.md](../errors.md).

## Introspection

Once the CLI exists, `typeway routes --json` prints the Elysia
route table (method, path, file). Until then, `backend` is
greppable: `rg "prefix: \"/" server/routes`. Agents must not add a
second router config file.
