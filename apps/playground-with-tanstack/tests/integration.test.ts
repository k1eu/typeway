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

  test("GET /api/notes reads SQLite through ALS (seed + create)", async () => {
    const seeded = await fetch(server.url + "/api/notes")
    expect(seeded.status).toBe(200)
    const before = (await seeded.json()) as { id: number; body: string }[]
    expect(before.length).toBeGreaterThanOrEqual(2)

    const created = await fetch(server.url + "/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "integration note" }),
    })
    expect(created.status).toBe(200)
    const note = (await created.json()) as { id: number; body: string }
    expect(note.body).toBe("integration note")

    const after = await (await fetch(server.url + "/api/notes")).json()
    expect(after).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: "integration note" }),
      ]),
    )
  })

  test("GET /notes SSR loads notes via TanStack server fn + shared DB", async () => {
    const res = await fetch(server.url + "/notes")
    expect(res.status).toBe(200)
    const html = await res.text()
    expectSsrDocument(html)
    expect(html).toContain("Shared notes")
    expect(html).toContain("AsyncLocalStorage")
    expect(html).toContain("Hello from SQLite")
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

  test("rendering demo: SSG and SSR pages ship markup, the SPA page does not", async () => {
    // Prerendering is a build step, so in dev the SSG page is server-rendered
    // like any other; what must hold in *both* modes is `ssr: false`.
    for (const [path, marker] of [
      ["/rendering/ssg", "ssg-content-in-html"],
      ["/rendering/ssr", "ssr-content-in-html"],
    ] as const) {
      const html = await (await fetch(server.url + path)).text()
      expect(html).toContain(marker)
    }

    const spa = await (await fetch(server.url + "/rendering/spa")).text()
    expectSsrDocument(spa)
    expect(spa).not.toContain("spa-content-in-browser-only")
  })
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

    test("GET /api/notes is handled by Elysia with SQLite", async () => {
      const res = await fetch(server.url + "/api/notes")
      expect(res.status).toBe(200)
      const notes = (await res.json()) as { body: string }[]
      expect(notes.length).toBeGreaterThanOrEqual(2)
      expect(notes[0]?.body).toBeTruthy()
    })

    test("hashed client asset is served from dist/client", async () => {
      // Filename comes from the build output, not from parsing HTML — script
      // tags can be injected late in the streamed document.
      const res = await fetch(`${server.url}/assets/${assetFile}`)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("javascript")
      expect((await res.text()).length).toBeGreaterThan(0)
    })

    test("prerendered page is written to dist/client and served as a static route", async () => {
      const file = Bun.file(
        appPath("dist", "client", "rendering", "ssg", "index.html"),
      )
      expect(await file.exists()).toBe(true)
      const onDisk = await file.text()

      // Served at the clean URL (and its trailing-slash form), byte-identical
      // to the prerendered file — i.e. the SSR mount never saw the request.
      for (const path of ["/rendering/ssg", "/rendering/ssg/"]) {
        const res = await fetch(server.url + path)
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toContain("text/html")
        expect(await res.text()).toBe(onDisk)
      }
    })

    test("SSR page is re-rendered per request, the SSG page is not", async () => {
      const stamp = async (path: string) => {
        const html = await (await fetch(server.url + path)).text()
        return html.match(/\d\d:\d\d:\d\d\.\d+ UTC/)?.[0]
      }

      const [ssg1, ssr1] = await Promise.all([
        stamp("/rendering/ssg"),
        stamp("/rendering/ssr"),
      ])
      expect(ssg1).toBeTruthy()
      expect(ssr1).toBeTruthy()

      await Bun.sleep(20)
      expect(await stamp("/rendering/ssg")).toBe(ssg1!)
      expect(await stamp("/rendering/ssr")).not.toBe(ssr1!)
    })

    test("ssr: false keeps the SPA route's markup out of the response", async () => {
      const res = await fetch(server.url + "/rendering/spa")
      expect(res.status).toBe(200)
      const html = await res.text()
      expectSsrDocument(html)
      expect(html).not.toContain("spa-content-in-browser-only")
    })

    test("unknown extensionless path falls through to the SSR handler", async () => {
      const res = await fetch(server.url + "/some-missing-page")
      expect(res.headers.get("content-type")).toContain("text/html")
      const html = await res.text()
      expectSsrDocument(html)
    })
  },
)
