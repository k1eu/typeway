import type { Elysia } from "elysia"
import { backend } from "./app"
import { withFetchContext } from "./fetch-context"
import { api as serverApi } from "../src/lib/api.server"

const g = globalThis as typeof globalThis & {
  __typewayServerApi?: typeof serverApi
}
g.__typewayServerApi = serverApi

/** Bun.serve entry with ALS — replaces bare `app.listen()` in boot files. */
export function listen(
  app: Pick<Elysia, "fetch">,
  port: number,
  onListen?: (info: { port: number }) => void,
) {
  const server = Bun.serve({
    port,
    fetch(request) {
      return withFetchContext(request, backend, () => app.fetch(request))
    },
  })

  onListen?.({ port: server.port ?? port })
  return server
}
