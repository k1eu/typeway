# Config and env

Two files, two jobs:

- `config/env.ts` — secrets and process environment, TypeBox, fail
  at import.
- `config/environments/*.ts` plus `config/application.ts` —
  non-secret knobs per `NODE_ENV`.

Do not read `process.env` anywhere else. `rg "process.env" --glob
'!config/**'` in a generated app should be empty (boot files may
read `PORT` / `HMR_PORT` only until they switch to `env`).

## `config/env.ts`

Elysia's `t` is the schema. `process.env` is all strings, so coerce
before checking. Throw a typed error, do not boot with defaults
that hide a missing secret in production.

```ts
// config/env.ts
import { t } from "elysia"
import type { Static } from "typebox"
import { EnvInvalid } from "../app/errors"

const Env = t.Object({
  NODE_ENV: t.Union([
    t.Literal("development"),
    t.Literal("test"),
    t.Literal("production"),
  ]),
  PORT: t.Number({ default: 3000 }),
  HMR_PORT: t.Number({ default: 24678 }),
  DATABASE_URL: t.String({ minLength: 1 }),
  BETTER_AUTH_SECRET: t.String({ minLength: 32 }),
  BETTER_AUTH_URL: t.Optional(t.String()),
})

export type Env = Static<typeof Env>

function coerce(raw: NodeJS.ProcessEnv): Record<string, unknown> {
  const nodeEnv = raw.NODE_ENV ?? "development"
  const port = Number(raw.PORT ?? 3000)
  const hmrPort = Number(raw.HMR_PORT ?? 24678)
  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    HMR_PORT: hmrPort,
    DATABASE_URL: raw.DATABASE_URL ?? "data/app.sqlite",
    BETTER_AUTH_SECRET: raw.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: raw.BETTER_AUTH_URL,
  }
}

function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const value = coerce(raw)
  // TypeBox via Elysia's compiler. If the import path moves in a
  // later RC, swap to Value.Check from Elysia's exported `t` helper
  // — do not add @sinclair/typebox as a direct dependency.
  const errors: string[] = []
  if (value.NODE_ENV !== "development" && value.NODE_ENV !== "test" && value.NODE_ENV !== "production") {
    errors.push("NODE_ENV must be development|test|production")
  }
  if (!Number.isFinite(value.PORT)) errors.push("PORT must be a number")
  if (typeof value.DATABASE_URL !== "string" || value.DATABASE_URL.length < 1) {
    errors.push("DATABASE_URL is required")
  }
  if (value.NODE_ENV === "production") {
    if (typeof value.BETTER_AUTH_SECRET !== "string" || value.BETTER_AUTH_SECRET.length < 32) {
      errors.push("BETTER_AUTH_SECRET must be at least 32 characters")
    }
  } else if (!value.BETTER_AUTH_SECRET) {
    value.BETTER_AUTH_SECRET = "dev-only-better-auth-secret-key-not-for-prod"
  }
  if (errors.length) throw new EnvInvalid(errors)
  return value as Env
}

export const env = parseEnv(process.env)

const port = env.PORT
export const betterAuthUrl =
  env.BETTER_AUTH_URL ?? `http://localhost:${port}`

export const trustedOrigins = [
  betterAuthUrl,
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]
```

`EnvInvalid` is `HTTPError.id("typeway.env.invalid", 500)` for
symmetry with the catalog; at boot it is thrown before listen and
prints `errors` on stderr. The generator's `new` app uses this
file. The playground still uses a hand-built object — cheap to
replace later, not in the docs PR.

Defaults:

| Key | Development / test | Production |
| --- | --- | --- |
| `NODE_ENV` | `development` | required |
| `PORT` | `3000` | `3000` |
| `HMR_PORT` | `24678` | unused |
| `DATABASE_URL` | `data/app.sqlite` | required, no default file in cwd |
| `BETTER_AUTH_SECRET` | well-known dev string | required, ≥32 chars |
| `BETTER_AUTH_URL` | `http://localhost:$PORT` | required |

Never default `BETTER_AUTH_SECRET` in production. The parse above
branches on `NODE_ENV`.

Drop the unused `TypeCheck` import if the RC does not export it —
the coerce-then-check sketch is the convention; a later
`@typeway/env` helper is **not** planned (that would be a wrapper).
If Elysia exposes a stable `t.Check` / `Value.Parse` on `t`, use
that and delete the hand-rolled `errors[]`.

## Per-environment config

```ts
// config/environments/development.ts
export default {
  logLevel: "debug" as const,
  seed: true,
}

// config/environments/test.ts
export default {
  logLevel: "error" as const,
  seed: false,
}

// config/environments/production.ts
export default {
  logLevel: "info" as const,
  seed: false,
}
```

```ts
// config/application.ts
import { env, betterAuthUrl, trustedOrigins } from "./env"
import development from "./environments/development"
import test from "./environments/test"
import production from "./environments/production"

const files = { development, test, production } as const

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  hmrPort: env.HMR_PORT,
  db: { url: env.DATABASE_URL },
  auth: {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: betterAuthUrl,
    trustedOrigins,
  },
  ...files[env.NODE_ENV],
} as const
```

Application code reads `config.logLevel`, not `process.env`. The
database URL still comes from `env` because `config/database.ts`
runs at import next to `env.ts`.

## Database boot

```ts
// config/database.ts
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { relations } from "../db/schema/relations"
import { env } from "./env"
import { config } from "./application"
import { seed } from "../db/seeds/development"

if (env.DATABASE_URL !== ":memory:") {
  mkdirSync(dirname(env.DATABASE_URL), { recursive: true })
}

export const sqlite = new Database(env.DATABASE_URL)
export const db = drizzle({ client: sqlite, relations })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

const migrationsFolder = fileURLToPath(
  new URL("../db/migrations", import.meta.url),
)

export function ensureSchema() {
  migrate(db, { migrationsFolder })
}

ensureSchema()
if (config.seed) seed()
```

`:memory:` is allowed for in-process tests. Integration tests that
cross Vite SSR must use a **file** (two connections, two graphs).
`tests/helpers.ts` already mkdirs a temp file per server process.

## What the CLI does not wrap

- `drizzle-kit generate` stays `bun run db:generate`.
- `vite build` stays `bun run build:frontend`.
- `bun build --target bun --outfile dist/app server.prod.ts` stays
  the prod bundle.
- `typeway db migrate` is **not** in the first CLI slice (plan 05).
  `ensureSchema()` at boot is the migrate path for sqlite.
