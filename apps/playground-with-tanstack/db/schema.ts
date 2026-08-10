import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
})

export type NoteRow = typeof notes.$inferSelect
export type NewNoteRow = typeof notes.$inferInsert
