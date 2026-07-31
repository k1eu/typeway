import { createFileRoute } from '@tanstack/react-router'

// Feature: a TanStack Start *file server route* streaming SSE. In dev this
// response is produced inside the connect() fallback and streamed back through
// BridgeResponse; in prod it streams straight out of the built handler.
export const Route = createFileRoute('/sse')({
  server: {
    handlers: {
      GET: () => {
        const encoder = new TextEncoder()
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(encoder.encode('event: tick\ndata: one\n\n'))
            await new Promise((resolve) => setTimeout(resolve, 200))
            controller.enqueue(encoder.encode('event: tick\ndata: two\n\n'))
            controller.close()
          },
        })

        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          },
        })
      },
    },
  },
})
