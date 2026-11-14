import { Elysia, t } from "elysia";
import { auth } from "./auth";
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
  .use(notesApi)
  /**
   * Session probe for the Better Auth demo — requires a valid session cookie.
   * Sign in via `/login`, then `GET /api/me`.
   */
  .get("/me", async ({ request, status }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return status(401);
    return { user: session.user };
  });

export type Backend = typeof backend;
