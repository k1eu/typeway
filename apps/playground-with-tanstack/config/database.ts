import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { sql } from "drizzle-orm"
import * as schema from "../db/schema"
import { env } from "./env"

const sqlite = new Database(env.DATABASE_URL)

export const db = drizzle(sqlite, { schema })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/** Idempotent bootstrap — no separate migration runner in this demo. */
export function ensureSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
}

/** Seed once so the demo page is not empty on first boot. */
export function seedDemoNotesIfEmpty() {
  const row = sqlite
    .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM notes")
    .get()
  if ((row?.count ?? 0) > 0) return

  db.insert(schema.notes)
    .values([
      { body: "Hello from SQLite — visible to Elysia and TanStack alike." },
      { body: "Loaded via AsyncLocalStorage at the fetch wrapper." },
    ])
    .run()
}

ensureSchema()
seedDemoNotesIfEmpty()

/** Test helper — wipe rows without dropping the table. */
export function resetNotesTable() {
  db.run(sql`DELETE FROM notes`)
}
