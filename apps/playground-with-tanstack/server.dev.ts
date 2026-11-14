import { tanstack, typeway } from "@typeway/server/dev";
import { Elysia } from "elysia";
import { backend } from "./server/app";
import { authPlugin } from "./server/auth-plugin";
import { listen } from "./server/listen";

await typeway({
  app: new Elysia().use(authPlugin).use(backend),
  frontend: tanstack(),
  serve: listen,
}).dev();
