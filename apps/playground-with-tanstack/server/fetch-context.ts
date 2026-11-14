import { db as rootDb } from "../config/database"
import { runWithContext, type AppContext } from "../app/context"

/**
 * Build per-request context once at the HTTP edge.
 * Session / tenant resolution would live here later.
 */
export async function buildAppContext(request: Request): Promise<AppContext> {
  return { db: rootDb, txDepth: 0, request }
}

/**
 * Enter AsyncLocalStorage before Elysia, TanStack SSR, or server functions run.
 * One `storage.run()` per HTTP request — shared by `/api/*` and `/_serverFn/*`.
 */
export async function withFetchContext(
  request: Request,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  const ctx = await buildAppContext(request)
  return runWithContext(ctx, handler)
}
