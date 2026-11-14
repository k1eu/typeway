import { createServerFn } from '@tanstack/react-start'
import { Note } from '../../app/models/note'

/**
 * Playground shortcut — generated apps must not do this.
 *
 * Domain reads go through Elysia (`GET /api/notes`) and Eden (`src/lib/api.ts`).
 * `createServerFn` is UI-local glue only. See docs/conventions/data-path.md.
 */
export const listNotes = createServerFn({ method: 'GET' }).handler(() => {
  return Note.all()
})
