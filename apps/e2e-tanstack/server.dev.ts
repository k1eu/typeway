import { viteDev } from "@typeway/vite/dev";
import { Elysia } from "elysia";
import { backend } from "./server/app";
import { devBridgeProbes } from "./server/dev-bridge-probes";

const app = new Elysia()
  .use(backend)
  .use(await viteDev({ middleware: devBridgeProbes }));

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () =>
  console.log(`Server running on localhost:${port} (development)`),
);
