import { createServerFn } from '@tanstack/react-start'
import { Note } from '../../app/models/note'

/** GET server function — loader calls this; no per-fn ALS wrapper needed. */
export const listNotes = createServerFn({ method: 'GET' }).handler(() => {
  return Note.all()
})
