import { connect } from "@typeway/connect";
import { Elysia } from "elysia";
import { createServer, isRunnableDevEnvironment } from "vite";
import { backend } from "./server/app";
import * as entry from "./server/entry";
import { listen } from "./server/listen";

const viteDevServer = await createServer({
  server: { middlewareMode: true },
});

/**
 * The SSR environment's module runner. `viteDevServer.ssrLoadModule` still
 * works, but it is on Vite 8's `future` removal list (alongside
 * `server.transformRequest`, `server.moduleGraph`, `server.hot`), and the
 * per-environment runner is its replacement.
 */
const ssrEnv = viteDevServer.environments.ssr;
if (!isRunnableDevEnvironment(ssrEnv)) {
  throw new Error(
    "Vite's `ssr` environment is not runnable — cannot load the server entry.",
  );
}

const app = new Elysia()
  .use(backend)
  .use(
    connect(viteDevServer.middlewares, {
      // Anything Vite doesn't serve is rendered by TanStack Start via Vite SSR
      fallback: async (request) => {
        try {
          const { default: serverEntry } = await ssrEnv.runner.import(
            entry.SOURCE,
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

listen(app, port, ({ port: bound }) =>
  console.log(`Server running on localhost:${bound} (development)`),
);
