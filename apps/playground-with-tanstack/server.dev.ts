import { connect } from "@typeway/connect";
import { Elysia } from "elysia";
import { createServer } from "vite";
import { backend } from "./server/app";

const viteDevServer = await createServer({
  server: { middlewareMode: true },
});

const app = new Elysia()
  .use(backend)
  .use(
    connect(viteDevServer.middlewares, {
      // Anything Vite doesn't serve is rendered by TanStack Start via Vite SSR
      fallback: async (request) => {
        try {
          const { default: serverEntry } = await viteDevServer.ssrLoadModule(
            "./src/tanstack-server.ts",
          );
          return serverEntry.fetch(request);
        } catch (error) {
          if (error instanceof Error) viteDevServer.ssrFixStacktrace(error);
          console.error(error);
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    }),
  );

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () =>
  console.log(`Server running on localhost:${port} (development)`),
);
