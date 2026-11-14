import { tanstack, typeway } from "@typeway/server/dev";
import { Elysia } from "elysia";
import { backend } from "./server/app";
import { devBridgeProbes } from "./server/dev-bridge-probes";

await typeway({
  app: new Elysia().use(backend),
  frontend: tanstack({ middleware: devBridgeProbes }),
}).dev();
