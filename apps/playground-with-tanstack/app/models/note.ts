import { desc, eq } from "drizzle-orm"
import { getDb } from "../context"
import { transaction } from "../transaction"
import { notes, type NoteRow } from "../../db/schema"

export const Note = {
  all(): NoteRow[] {
    return getDb().select().from(notes).orderBy(desc(notes.createdAt)).all()
  },

  create(body: string): NoteRow {
    return getDb()
      .insert(notes)
      .values({ body })
      .returning()
      .get()
  },

  /** Demonstrates nested `transaction()` — read-back inside the same tx. */
  createWithAudit(body: string): NoteRow {
    return transaction(() => {
      const note = Note.create(body)
      const found = getDb()
        .select()
        .from(notes)
        .where(eq(notes.id, note.id))
        .get()
      if (!found) throw new Error("note missing inside transaction")
      return note
    })
  },
}
