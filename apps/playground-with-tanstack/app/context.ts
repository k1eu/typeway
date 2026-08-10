import { AsyncLocalStorage } from "node:async_hooks"
import { db as rootDb, type Db, type Tx } from "../config/database"

export type AppContext = {
  db: Db | Tx
  /** >0 while inside `transaction()` — nested calls join the outer tx. */
  txDepth: number
}

const storage = new AsyncLocalStorage<AppContext>()

const defaultContext = (): AppContext => ({ db: rootDb, txDepth: 0 })

export function getContext(): AppContext {
  return storage.getStore() ?? defaultContext()
}

/** What models and services call — pool or active transaction client. */
export function getDb(): Db | Tx {
  return getContext().db
}

export function runWithContext<T>(ctx: AppContext, fn: () => T): T {
  return storage.run(ctx, fn)
}
