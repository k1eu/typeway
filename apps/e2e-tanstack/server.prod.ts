import { viteProd } from "@typeway/vite";
import { Elysia } from "elysia";
import { backend } from "./server/app";

// Specifier must stay literal — bun build --target bun inlines it.
// @ts-ignore built output only exists after `bun run build`
const { default: handler } = await import("./dist/server/server.js");

const app = new Elysia()
  .use(backend)
  .use(await viteProd({ handler }));

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () =>
  console.log(`Server running on localhost:${port} (production)`),
);
