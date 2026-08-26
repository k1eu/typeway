import { viteProd } from "@typeway/vite/prod";
import { Elysia } from "elysia";
import { backend } from "./server/app";
import { authPlugin } from "./server/auth-plugin";
import { listen } from "./server/listen";

// Specifier must stay literal — bun build --target bun inlines it.
// @ts-ignore built output only exists after `bun run build`
const { default: handler } = await import("./dist/server/server.js");

const app = new Elysia()
  .use(authPlugin)
  .use(backend)
  .use(await viteProd({ handler }));

const port = Number(process.env.PORT ?? 3000);

listen(app, port, ({ port: bound }) =>
  console.log(`Server running on localhost:${bound} (production)`),
);
