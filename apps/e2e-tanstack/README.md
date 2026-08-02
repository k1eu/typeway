# e2e-tanstack

Kitchen-sink fixture app: one route per TanStack Start feature that crosses HTTP,
so we can prove each one survives `@typeway/connect`. It is a **test fixture, not
a demo** — no styling, no dependencies beyond what a feature needs. Human-facing
examples belong in `apps/playground-with-tanstack`.

```sh
bun run --filter e2e-tanstack test:integration   # dev + prod, ~5s incl. build
```

Every test runs against both servers, because they are different failure
surfaces: dev is Vite middlewareMode through `connect()` with SSR in the
`fallback`, prod is the built handler `.mount()`ed on Elysia behind a boot-time
manifest of `dist/client` as static routes (no bridge at all).

| Route / fixture | Feature |
|---|---|
| `/` | plain SSR |
| `/deferred` | streaming SSR — `<Await>` over a 300 ms promise |
| `/redirect` | `throw redirect()` from a loader |
| `/missing` | `notFound()` from a loader |
| `/cookies` | two `setCookie` calls + a custom response header |
| `/serverfn` | publishes the compiler-generated server-fn URLs as data attributes |
| `src/serverFn.ts` | JSON echo + multipart upload server functions |
| `src/routes/sse.ts` | SSE via a TanStack file server route |
| `/api/hello`, `/api/sse` | Elysia routes — bridge-bypass controls |
| `public/pixel.png` | binary static asset |
| `/__entry` | answered by `src/server.ts` itself — proves dev and prod run the same entry module |
| `server/dev-bridge-probes.ts` | `/__bridge/*` — Connect middleware that exercises the bridge directly |

## Gotchas these tests encode

- **TanStack turns streaming off for bots.** It calls `isbot(user-agent)` and, on
  a match, waits for React's `allReady` before emitting anything — the document
  then arrives as a single chunk. Bun's default `Bun/x.y.z` UA and curl both
  match. Streaming assertions must send `BROWSER_UA` from `tests/helpers.ts`, or
  they silently test the non-streaming path and pass for the wrong reason.
- **SSR responses never touch `BridgeResponse`/`BridgeRequest`.** `connect()`
  hands the `fallback` a `Request` and returns whatever it produces, so a
  streaming-SSR test proves nothing about the bridge's own streaming. That is
  what the `/__bridge/*` probe middlewares are for (tests 11 and 12, dev only).
- **Server functions** are POSTed to `/_serverFn/<id>` and need
  `sec-fetch-site: same-origin` (CSRF) plus `x-tsr-serverFn: true`; payloads are
  seroval-encoded both ways.
- `tests/helpers.ts` duplicates `apps/playground-with-tanstack/tests/helpers.ts`.
  Worth extracting to a shared test package once a third consumer appears.
