import { t } from "elysia"

/** Public write shape for `POST /api/notes`. Shared with the Elysia route. */
export const NoteCreate = t.Object({
  body: t.String({ minLength: 1 }),
})

export const NoteUpdate = t.Partial(NoteCreate)

export const NoteParams = t.Object({
  id: t.Number(),
})

export const Note = t.Object({
  id: t.Number(),
  body: t.String(),
  createdAt: t.Date(),
})
