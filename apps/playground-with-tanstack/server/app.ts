import { Elysia, t } from "elysia";
import { notesApi } from "./routes/notes";

export const backend = new Elysia({ prefix: "/api" })
  .get(
    "/hello",
    {
      query: t.Object({
        name: t.Optional(t.String()),
      }),
    },
    ({ query }) => ({ message: `Hello ${query.name ?? "world"}` }),
  )
  .use(notesApi);
