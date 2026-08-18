/**
 * Typed process env for the playground server.
 * Production apps would validate more keys (secrets, feature flags, …).
 */
const nodeEnv = process.env.NODE_ENV ?? "development"
const port = Number(process.env.PORT ?? 3000)

/** Demo-only secret — override with BETTER_AUTH_SECRET in real deployments. */
const defaultAuthSecret =
  "playground-better-auth-secret-key-do-not-use-in-prod"

const betterAuthUrl =
  process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`

export const env = {
  NODE_ENV: nodeEnv as "development" | "production" | "test",
  /** Bun SQLite path or `:memory:` (default: file under ./data). */
  DATABASE_URL: process.env.DATABASE_URL ?? "data/playground.sqlite",
  PORT: port,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? defaultAuthSecret,
  BETTER_AUTH_URL: betterAuthUrl,
  /** Origins allowed to call /api/auth (CSRF). Keep in sync with the listen URL. */
  BETTER_AUTH_TRUSTED_ORIGINS: [
    betterAuthUrl,
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ],
} as const
