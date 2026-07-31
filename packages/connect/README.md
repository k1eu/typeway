# @typeway/connect

Run Connect/Express-style middleware — most importantly a Vite dev server in middleware mode — under [Elysia](https://elysiajs.com). Zero runtime dependencies.

```ts
import { connect } from "@typeway/connect";
import { Elysia } from "elysia";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true } });

const app = new Elysia()
  .get("/api/hello", () => ({ ok: true })) // never touches the bridge
  .use(
    connect(vite.middlewares, {
      // runs when middleware next()s through — e.g. SSR
      fallback: async (request) => {
        const { default: entry } = await vite.ssrLoadModule("./src/server.ts");
        return entry.fetch(request);
      },
    }),
  )
  .listen(3000);
```

## API

### `connect(middleware, options?)`

- `middleware` — a single Connect middleware `(req, res, next) => void` or an array (run in order, with Connect semantics: `next(err)` skips to the next 4-arity error handler). A Connect app instance like `vite.middlewares` is itself a middleware and can be passed directly.
- `options.fallback?: (request: Request) => Response | Promise<Response>` — produces the response when every middleware passed through via `next()` without responding. Defaults to a plain 404. Headers set by middleware before falling through (CORS, cookies, …) are merged onto the fallback response.

Returns an Elysia plugin.

## How it behaves

- **Mounted as a wildcard route, not a global hook.** Elysia's router gives registered routes precedence over wildcards, so your API routes bypass the bridge entirely — no filtering config, no per-request overhead on them. Consequence: the plugin owns the catch-all; put your SSR/catch-all logic in `fallback` instead of a separate `app.all("*")`.
- **Request bodies are raw streams.** `req` is a real `Readable` over the incoming body — JSON, urlencoded, and multipart all reach middleware untouched, exactly as under Node. `req.body` is *not* pre-parsed; that's body-parsing middleware's job, as in real Connect.
- **Responses stream.** The web `Response` is resolved on the first `res.write()` / `res.flushHeaders()` / `res.end()`, with a `ReadableStream` body. SSE works, large files don't buffer, bytes are never coerced to strings.
- **Header fidelity.** Multiple `Set-Cookie` values survive as separate headers; empty-body statuses (204/304/…) produce `null`-body responses.

## Limitations

- Status and headers are final at the first body write — middleware that mutates headers afterwards or uses trailers isn't supported.
- Vite in middleware mode opens its HMR websocket on its own port (default 24678), because websocket upgrades can't be forwarded through the bridge. Fine on localhost; behind a single-port proxy set `server.hmr` explicitly or expose that port.
- Express-specific APIs beyond what Connect defines (`req.app.get(...)` returns `false`, no `res.json`/`res.send`) are stubbed or absent — this hosts *Connect* middleware, not full Express apps.
