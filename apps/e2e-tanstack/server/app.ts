import { Elysia, t } from "elysia";

/**
 * Elysia-owned routes. These are registered *before* the connect() wildcard,
 * so they bypass the bridge entirely — the "bridge bypass control" in the
 * feature suite.
 */
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
  // Streaming control: an SSE endpoint hosted by Elysia itself (never touches
  // the bridge). The TanStack-hosted equivalent lives in src/routes/sse.ts.
  .get("/sse", () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode("event: tick\ndata: one\n\n"));
        await new Promise((resolve) => setTimeout(resolve, 200));
        controller.enqueue(encoder.encode("event: tick\ndata: two\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  });
