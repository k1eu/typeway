import { Elysia, t } from "elysia"
import { Note } from "../../app/models/note"

/**
 * Elysia JSON API for notes. Handlers call `Note.*` directly — `getDb()` works
 * because `server/listen.ts` entered ALS at the fetch wrapper.
 */
export const notesApi = new Elysia({ prefix: "/notes" })
  .get("/", () => Note.all())
  .post(
    "/",
    {
      body: t.Object({
        body: t.String({ minLength: 1 }),
      }),
    },
    async ({ body }) => Note.createWithAudit(body.body),
  )
