import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "../config/database"
import * as schema from "../db/schema"
import { env } from "../config/env"

/**
 * Better Auth on the playground Drizzle instance.
 * Tables live in `db/auth.schema.ts` (from `bun run auth:generate`) and
 * are applied by the Drizzle migrator in `config/database.ts`.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [...env.BETTER_AUTH_TRUSTED_ORIGINS],
  emailAndPassword: {
    enabled: true,
  },
})

export type Session = typeof auth.$Infer.Session
