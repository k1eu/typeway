import type { Backend } from "./app"
import { db as rootDb } from "../config/database"
import { runWithContext, type AppContext } from "../app/context"

/**
 * Build per-request context once at the HTTP edge.
 * Session / tenant resolution would live here later.
 */
export async function buildAppContext(
  request: Request,
  backend: Backend,
): Promise<AppContext> {
  return { db: rootDb, txDepth: 0, request, backend }
}

/**
 * Enter AsyncLocalStorage before Elysia, TanStack SSR, or server functions run.
 * One `storage.run()` per HTTP request — shared by `/api/*` and the document.
 */
export async function withFetchContext(
  request: Request,
  backend: Backend,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  const ctx = await buildAppContext(request, backend)
  return runWithContext(ctx, handler)
}
