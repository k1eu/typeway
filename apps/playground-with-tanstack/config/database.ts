import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { sql } from "drizzle-orm"
import * as schema from "../db/schema"
import { env } from "./env"

if (env.DATABASE_URL !== ":memory:") {
  mkdirSync(dirname(env.DATABASE_URL), { recursive: true })
}

/** Shared Bun SQLite handle — Drizzle (notes + Better Auth). */
export const sqlite = new Database(env.DATABASE_URL)

export const db = drizzle({ client: sqlite })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url))

/** Apply committed Drizzle migrations (notes + Better Auth tables). */
export function ensureSchema() {
  migrate(db, { migrationsFolder })
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
