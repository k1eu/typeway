import { Elysia, t } from "elysia"
import { Note } from "../../app/models/note"
import { NoteNotFound } from "../../app/errors"
import {
  Note as NoteSchema,
  NoteCreate,
  NoteParams,
  NoteUpdate,
} from "../../app/schemas/note"

/**
 * Elysia JSON API for notes. Handlers call `Note.*` — `getDb()` works
 * because `server/listen.ts` entered ALS at the fetch wrapper.
 *
 * TanStack pages call this through Eden (`src/lib/api.ts`). POST still uses
 * `createWithAudit` so the nested-transaction demo stays in the playground.
 */
export const notesApi = new Elysia({ prefix: "/notes" })
  .get("/", { response: t.Array(NoteSchema) }, () => Note.all())
  .post(
    "/",
    { body: NoteCreate, response: NoteSchema },
    ({ body }) => Note.createWithAudit(body.body),
  )
  .get("/:id", { params: NoteParams, response: NoteSchema }, ({ params }) => {
    const row = Note.find(params.id)
    if (!row) return new NoteNotFound(params.id)
    return row
  })
  .patch(
    "/:id",
    { params: NoteParams, body: NoteUpdate, response: NoteSchema },
    ({ params, body }) => {
      if (body.body === undefined) {
        const row = Note.find(params.id)
        if (!row) return new NoteNotFound(params.id)
        return row
      }
      const row = Note.update(params.id, body.body)
      if (!row) return new NoteNotFound(params.id)
      return row
    },
  )
  .delete("/:id", { params: NoteParams, response: NoteSchema }, ({ params }) => {
    const row = Note.destroy(params.id)
    if (!row) return new NoteNotFound(params.id)
    return row
  })
