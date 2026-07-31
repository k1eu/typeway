import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Connect middleware mounted ahead of Vite in the dev server.
 *
 * TanStack's own responses are produced by `connect()`'s `fallback`, so they
 * never travel through `BridgeResponse`/`BridgeRequest`. These two probe
 * routes are the only fixtures that exercise the bridge's own invariants
 * end-to-end over a real socket:
 *
 *   GET  /__bridge/stream     — `res.write()` twice, 200ms apart. Proves the
 *                               web Response resolves on the *first* write
 *                               instead of buffering until `end()`.
 *   POST /__bridge/echo-body  — consumes `req` as a raw `Readable`. Proves the
 *                               request body reaches middleware unparsed, as
 *                               it would under Node.
 *
 * Dev-only: the prod server has no bridge at all.
 */
export function devBridgeProbes(
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) {
  const path = (req.url ?? "").split("?")[0];

  if (path === "/__bridge/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    });
    res.write("event: tick\ndata: one\n\n");
    setTimeout(() => {
      res.write("event: tick\ndata: two\n\n");
      res.end();
    }, 200);
    return;
  }

  if (path === "/__bridge/echo-body") {
    const parts: Buffer[] = [];
    let bytes = 0;

    req.on("data", (chunk: Buffer) => {
      parts.push(chunk);
      bytes += chunk.length;
    });
    req.on("error", next);
    req.on("end", () => {
      const raw = Buffer.concat(parts);
      const label = /name="label"\r?\n\r?\n([^\r\n]*)/.exec(raw.toString("latin1"));

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          bytes,
          contentType: req.headers["content-type"] ?? null,
          label: label?.[1] ?? null,
        }),
      );
    });
    return;
  }

  next();
}
