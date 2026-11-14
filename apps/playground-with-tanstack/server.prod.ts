import { tanstack, typeway } from "@typeway/server";
import { Elysia } from "elysia";
import { backend } from "./server/app";
import { authPlugin } from "./server/auth-plugin";
import { listen } from "./server/listen";

// Specifier must stay literal — bun build --target bun inlines it.
// @ts-ignore built output only exists after `bun run build`
const { default: handler } = await import("./dist/server/server.js");

await typeway({
  app: new Elysia().use(authPlugin).use(backend),
  frontend: tanstack({ handler }),
  serve: listen,
}).prod();
