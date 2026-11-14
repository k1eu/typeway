import { t } from "elysia"

/** Public write shape for `POST /api/notes`. Shared with the Elysia route. */
export const NoteCreate = t.Object({
  body: t.String({ minLength: 1 }),
})
