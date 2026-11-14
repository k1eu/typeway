import { treaty } from "@elysia/eden"
import type { Backend } from "../../server/app"

export type Api = ReturnType<typeof treaty<Backend>>

type ServerApiSlot = typeof globalThis & {
  __typewayServerApi?: () => Api
}

/**
 * Isomorphic Eden client. Browser: HTTP to the same origin. SSR: the host
 * process registers `globalThis.__typewayServerApi` from `server/listen.ts`
 * (Vite SSR is ESM — `require()` is not defined).
 */
export function api(): Api {
  if (import.meta.env.SSR) {
    const serverApi = (globalThis as ServerApiSlot).__typewayServerApi
    if (!serverApi) {
      throw new Error(
        "getBackend() Eden client is not wired — server/listen.ts must register __typewayServerApi",
      )
    }
    return serverApi()
  }
  return treaty<Backend>(window.location.origin)
}
