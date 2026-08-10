import { db as rootDb } from "../config/database"
import { getContext, runWithContext } from "./context"

/**
 * Rails-like transaction helper: nested calls reuse the outer transaction
 * instead of opening a new one. `getDb()` returns the tx client inside.
 */
export async function transaction<T>(fn: () => T | Promise<T>): Promise<T> {
  const ctx = getContext()
  if (ctx.txDepth > 0) {
    return fn()
  }

  return rootDb.transaction((tx) =>
    runWithContext({ ...ctx, db: tx, txDepth: ctx.txDepth + 1 }, () => fn()),
  )
}
