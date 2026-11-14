import { db as rootDb, type Tx } from "../config/database"
import { getContext, runWithContext } from "./context"

/**
 * Rails-like transaction helper: nested calls reuse the outer transaction
 * instead of opening a new one. `getDb()` returns the tx client inside.
 *
 * Sync on purpose — drizzle-orm 1.x bun-sqlite rejects async transaction
 * callbacks (`DrizzleTypeError<"Sync drivers can't use async functions in
 * transactions!">`).
 */
export function transaction<T>(fn: () => T): T {
  const ctx = getContext()
  if (ctx.txDepth > 0) {
    return fn()
  }

  // bun-sqlite transactions are sync. drizzle-orm 1.x types reject a generic
  // `T` that might be a Promise, so we call through a sync-only signature.
  const run = rootDb.transaction.bind(rootDb) as (
    transaction: (tx: Tx) => T,
  ) => T
  return run((tx) =>
    runWithContext({ ...ctx, db: tx, txDepth: ctx.txDepth + 1 }, fn),
  )
}
