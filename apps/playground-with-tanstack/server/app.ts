import { Elysia, t } from "elysia";

export const backend = new Elysia({ prefix: "/api" }).get(
  "/hello",
  {
    query: t.Object({
      name: t.Optional(t.String()),
    }),
  },
  ({ query }) => ({ message: `Hello ${query.name ?? "world"}` }),
);
