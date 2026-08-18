import { Elysia } from "elysia"
import { auth } from "./auth"

/**
 * Better Auth HTTP surface at `/api/auth/*`.
 *
 * Use explicit `/api/auth` routes — not `.mount(auth.handler)`. Mount registers
 * a catch-all (`* /*`), and `@typeway/connect`'s own wildcard wins over that
 * when registered later, so auth requests fall through to TanStack SSR.
 * Named `/api/auth` paths stay ahead of the bridge wildcard (same rule as
 * `/api/hello`).
 */
export const authPlugin = new Elysia({ name: "better-auth" })
  .all("/api/auth", ({ request }) => auth.handler(request))
  .all("/api/auth/*", ({ request }) => auth.handler(request))
