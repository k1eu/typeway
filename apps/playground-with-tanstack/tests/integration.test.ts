/**
 * Integration smoke test — plan 01.
 *
 * Boots the real servers as subprocesses and asserts the contract that
 * "Elysia + Vite + TanStack Start work through @typeway/connect":
 *   - Elysia routes bypass the bridge
 *   - Vite dev middleware serves through the bridge (transforms, 304s)
 *   - everything else falls through to TanStack SSR
 *
 * Set SKIP_BUILD=1 to skip the (slower) production build + prod server block.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import {
  appPath,
  buildApp,
  startDevServer,
  startProdServer,
  type ServerHandle,
} from "./helpers"

/** SSR-rendered copy from src/routes/index.tsx — proves React ran on the server. */
const HOME_SSR_TEXT = "Start simple, ship quickly."

function expectSsrDocument(html: string) {
  expect(html.slice(0, 200)).toContain("<!DOCTYPE html")
  // Router hydration payload + the client entry script tag.
  expect(html).toContain("$_TSR")
  expect(html).toMatch(/<script[^>]*type="module"/)
}

describe("dev server (Vite middlewareMode through connect)", () => {
  let server: ServerHandle

  beforeAll(async () => {
    server = await startDevServer()
  }, 120_000)

  afterAll(async () => {
    await server?.stop()
  })

  test("GET / is server-rendered by TanStack via the connect fallback", async () => {
    const res = await fetch(server.url + "/")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")
    const html = await res.text()
    expectSsrDocument(html)
    expect(html).toContain(HOME_SSR_TEXT)
  })

  test("GET /@vite/client is served by Vite middleware", async () => {
    const res = await fetch(server.url + "/@vite/client")
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body.length).toBeGreaterThan(0)
    expect(body.startsWith("import") || body.includes("createHotContext")).toBe(
      true,
    )
  })

  test("GET /src/router.tsx is transformed to JS, not raw TSX", async () => {
    const res = await fetch(server.url + "/src/router.tsx")
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain("import")
    // TS-only syntax from the source file must have been stripped...
    expect(body).not.toContain("declare module")
    expect(body).not.toContain("interface Register")
    // ...and bare specifiers rewritten to Vite-served URLs.
    expect(body).not.toContain('from "@tanstack/react-router"')
    expect(body).not.toContain("from '@tanstack/react-router'")
    expect(body).toMatch(/from ["']\/(@fs\/|@id\/|node_modules\/)?/)
  })

  test("GET /src/styles.css returns a non-empty body", async () => {
    // NB: Vite serves CSS in dev as a JS module — assert status/body, never
    // content-type (see plans/README.md gotchas).
    const res = await fetch(server.url + "/src/styles.css")
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body.length).toBeGreaterThan(0)
  })

  test("GET /api/hello bypasses the bridge (registered Elysia route wins)", async () => {
    const res = await fetch(server.url + "/api/hello?name=ci")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(await res.json()).toEqual({ message: "Hello ci" })
  })

  test("unknown route reaches TanStack SSR, not a bare bridge 404", async () => {
    const res = await fetch(server.url + "/some-missing-page")
    // TanStack answers with its own not-found document (currently 404).
    expect(res.headers.get("content-type")).toContain("text/html")
    const html = await res.text()
    expectSsrDocument(html)
    // The bridge's default fallback 404 is a bare "Not Found" text body.
    expect(html).not.toBe("Not Found")
  })

  test("conditional request replays the ETag and gets a bodyless 304", async () => {
    const first = await fetch(server.url + "/@vite/client")
    expect(first.status).toBe(200)
    const etag = first.headers.get("etag")
    expect(etag).toBeTruthy()
    await first.text()

    const second = await fetch(server.url + "/@vite/client", {
      headers: { "If-None-Match": etag! },
    })
    expect(second.status).toBe(304)
    expect(second.headers.get("content-length")).toBe("0")
    // NB: don't assert `second.body === null` — the bridge does send a
    // null-body Response, but Bun's client-side fetch materializes an empty
    // closed ReadableStream for it either way.
    expect(await second.text()).toBe("")
  })

  // Plan 01 has no POST endpoint to exercise; request-body forwarding through
  // the bridge is covered by packages/connect unit tests, and end-to-end
  // POSTs (server functions / form actions) land in plan 02's fixture app.
  test.skip("POST body reaches the SSR handler", () => {})
})

describe.skipIf(process.env.SKIP_BUILD === "1")(
  "prod server (built handler + Bun.file statics)",
  () => {
    let server: ServerHandle
    let assetFile: string

    beforeAll(async () => {
      await buildApp()
      assetFile = readdirSync(appPath("dist", "client", "assets")).find((f) =>
        f.endsWith(".js"),
      )!
      expect(assetFile).toBeTruthy()
      server = await startProdServer()
    }, 300_000)

    afterAll(async () => {
      await server?.stop()
    })

    test("GET / is server-rendered by the built TanStack handler", async () => {
      const res = await fetch(server.url + "/")
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("text/html")
      const html = await res.text()
      expectSsrDocument(html)
      expect(html).toContain(HOME_SSR_TEXT)
    })

    test("GET /api/hello is handled by Elysia", async () => {
      const res = await fetch(server.url + "/api/hello?name=prod")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ message: "Hello prod" })
    })

    test("hashed client asset is served from dist/client", async () => {
      // Filename comes from the build output, not from parsing HTML — script
      // tags can be injected late in the streamed document.
      const res = await fetch(`${server.url}/assets/${assetFile}`)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("javascript")
      expect((await res.text()).length).toBeGreaterThan(0)
    })

    test("unknown extensionless path falls through to the SSR handler", async () => {
      const res = await fetch(server.url + "/some-missing-page")
      expect(res.headers.get("content-type")).toContain("text/html")
      const html = await res.text()
      expectSsrDocument(html)
    })
  },
)
