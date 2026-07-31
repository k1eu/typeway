/**
 * Minimal reproduction of the @typeway/connect bug uncovered by plan 02.
 *
 * `connect()` builds its Node-style `req` eagerly with
 * `Readable.fromWeb(request.body)` (packages/connect/src/index.ts ->
 * createBridgeRequest), which locks the web stream before any middleware runs.
 * When the chain falls through via `next()`, `options.fallback(request)` is
 * handed that same Request — so reading the body throws "Body already used".
 *
 * Impact: in the dev setup (Vite middlewareMode + SSR in the fallback) EVERY
 * POST with a body is broken, including TanStack Start server functions and
 * multipart uploads. See tests 6 and 7 in features.test.ts.
 *
 * Suggested fix (for the connect owner — deliberately NOT applied here):
 * either `tee()` the body and give the fallback a fresh Request built from the
 * second branch, or create the `Readable` lazily on first read and hand the
 * fallback an untouched Request when no middleware consumed it.
 *
 * Declared with `test.failing`: green while the bug exists, RED the moment it
 * is fixed — at which point delete this file and flip tests 6 and 7 in
 * features.test.ts back to plain `test`.
 */

import { describe, expect, test } from "bun:test";
import { connect } from "@typeway/connect";
import { Elysia } from "elysia";

describe("@typeway/connect fallback request body", () => {
  test.failing("fallback can read a POST body that middleware skipped", async () => {
    const app = new Elysia()
      .use(
        connect((_req, _res, next) => next(), {
          fallback: async (request) => Response.json({ body: await request.text() }),
        }),
      )
      .listen(0);

    try {
      const res = await fetch(`http://localhost:${app.server!.port}/anything`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hello: "world" }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ body: '{"hello":"world"}' });
    } finally {
      app.stop();
    }
  });
});
