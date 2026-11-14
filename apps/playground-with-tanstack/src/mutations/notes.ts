import { createServerFn } from '@tanstack/react-start'
import { Note } from '../../app/models/note'

/** Dual path — same rule as `src/data/notes.ts`. Prefer `POST /api/notes`. */
export const createNote = createServerFn({ method: 'POST' })
  .validator((input: { body: string }) => {
    const body = input?.body?.trim()
    if (!body) throw new Error('body is required')
    return { body }
  })
  .handler(({ data }) => {
    return Note.createWithAudit(data.body)
  })
