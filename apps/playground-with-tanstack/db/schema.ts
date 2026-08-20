/**
 * App tables plus Better Auth tables.
 * Auth tables are generated — `bun run auth:generate` — then folded in here
 * so Drizzle migrations (`bun run db:generate`) cover the whole schema.
 */
export * from "./auth.schema"

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
