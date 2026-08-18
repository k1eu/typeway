import { betterAuth } from "better-auth"
import { getMigrations } from "better-auth/db/migration"
import { sqlite } from "../config/database"
import { env } from "../config/env"

/**
 * Better Auth on the same Bun SQLite DB as the notes demo.
 * Tables are created via Better Auth's built-in migrator (Kysely + bun:sqlite).
 */
export const auth = betterAuth({
  database: sqlite,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [...env.BETTER_AUTH_TRUSTED_ORIGINS],
  emailAndPassword: {
    enabled: true,
  },
})

const { runMigrations } = await getMigrations(auth.options)
await runMigrations()

export type Session = typeof auth.$Infer.Session
