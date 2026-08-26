import { viteDev } from "@typeway/vite";
import { Elysia } from "elysia";
import { backend } from "./server/app";
import { authPlugin } from "./server/auth-plugin";
import { listen } from "./server/listen";

const app = new Elysia()
  .use(authPlugin)
  .use(backend)
  .use(await viteDev());

const port = Number(process.env.PORT ?? 3000);

listen(app, port, ({ port: bound }) =>
  console.log(`Server running on localhost:${bound} (development)`),
);
