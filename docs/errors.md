# Error codes

`HTTPError.typeBase = "https://typeway.dev/errors"`. The `code`
member is the identifier below; `type` is
`https://typeway.dev/errors/<code>`. That host is not shipped yet —
this file is the catalog.

Prefer **returning** an `HTTPError.id` instance from an Elysia
handler so Eden types the status.

## Framework (`typeway.*`)

| Code | HTTP | When |
| --- | --- | --- |
| `typeway.env.invalid` | 500 (boot throw) | `config/env.ts` rejected `process.env` |
| `typeway.auth.unauthenticated` | 401 | No session on a guarded route |
| `typeway.auth.forbidden` | 403 | Session present, not allowed |
| `validation` | 422 | Elysia / TypeBox — built-in, do not wrap |
| `not-found` | 404 | Elysia built-in, no route. App 404s use `{resource}.not_found` instead |
| `parse` | 400 | Elysia built-in, body parse |
| `internal-server-error` | 500 | Unhandled |
| `typeway.generate.exists` | CLI 1 | Generate refused to overwrite |
| `typeway.generate.invalid_name` | CLI 1 | Name is not `/^[a-z][a-z0-9-]*$/` |
| `typeway.routes.unreadable` | CLI 1 | Cannot import `server/app.ts` |

## App (`{resource}.{reason}`)

Generated with the resource. Examples for `article`:

| Code | HTTP | Class |
| --- | --- | --- |
| `article.not_found` | 404 | `ArticleNotFound` |

Add `{resource}.conflict` (409) when a unique constraint is part of
the public API. Do not map every Drizzle driver error through this
catalog — only what a client should branch on.

## CLI JSON

Same `code` strings. Body:

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
