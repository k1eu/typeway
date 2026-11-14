import { Elysia } from "elysia"
import { Note } from "../../app/models/note"
import { NoteCreate } from "../../app/schemas/note"

/**
 * Elysia JSON API for notes. Handlers call `Note.*` directly — `getDb()` works
 * because `server/listen.ts` entered ALS at the fetch wrapper.
 *
 * Generated apps expose this as the only typed door; TanStack pages call it
 * through Eden. This playground still also has `src/data/notes.ts` server fns
 * (see docs/conventions.md playground gaps).
 */
export const notesApi = new Elysia({ prefix: "/notes" })
  .get("/", () => Note.all())
  .post(
    "/",
    { body: NoteCreate },
    ({ body }) => Note.createWithAudit(body.body),
  )
