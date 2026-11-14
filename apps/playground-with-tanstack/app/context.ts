import { AsyncLocalStorage } from "node:async_hooks"
import { db as rootDb, type Db, type Tx } from "../config/database"

export type AppContext = {
  db: Db | Tx
  /** >0 while inside `transaction()` — nested calls join the outer tx. */
  txDepth: number
  /** Incoming HTTP request, when ALS was entered at the fetch wrapper. */
  request?: Request
}

/**
 * Process-global ALS so the Bun host graph and Vite's SSR graph share one
 * store. A module-local `new AsyncLocalStorage()` is a second map: SSR
 * `getDb()` would miss the request scope and fall back to the pool.
 * See docs/conventions/data-path.md.
 */
const g = globalThis as typeof globalThis & {
  __typewayContext?: AsyncLocalStorage<AppContext>
}
const storage = (g.__typewayContext ??= new AsyncLocalStorage<AppContext>())

const defaultContext = (): AppContext => ({ db: rootDb, txDepth: 0 })

export function getContext(): AppContext {
  return storage.getStore() ?? defaultContext()
}

/** What models and services call — pool or active transaction client. */
export function getDb(): Db | Tx {
  return getContext().db
}

export function getRequest(): Request | undefined {
  return getContext().request
}

export function runWithContext<T>(ctx: AppContext, fn: () => T): T {
  return storage.run(ctx, fn)
}
