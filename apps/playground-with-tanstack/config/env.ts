/**
 * Typed process env for the playground server.
 * Production apps would validate more keys (secrets, feature flags, …).
 */
const nodeEnv = process.env.NODE_ENV ?? "development"

export const env = {
  NODE_ENV: nodeEnv as "development" | "production" | "test",
  /** Bun SQLite path or `:memory:` (default: file under ./data). */
  DATABASE_URL: process.env.DATABASE_URL ?? "data/playground.sqlite",
  PORT: Number(process.env.PORT ?? 3000),
} as const
