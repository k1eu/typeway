import { Elysia } from "elysia";
import { backend } from "./server/app";

const app = new Elysia().use(backend);

// Production: load the pre-built TanStack Start handler
// @ts-ignore built output only exists after `bun run build`
const { default: handler } = await import("./dist/server/server.js");

// Production: serve static assets from dist/client, fall back to SSR handler
app.all("*", async ({ request }) => {
  const { pathname } = new URL(request.url);

  if (pathname !== "/") {
    const asset = Bun.file(`./dist/client${pathname}`);
    if (await asset.exists()) return new Response(asset);
  }

  return handler.fetch(request);
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => console.log(`Server running on localhost:${port}`));
