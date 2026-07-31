/**
 * TanStack Start feature coverage through @typeway/connect.
 *
 * Every capability that traverses HTTP is exercised against BOTH servers:
 *   dev  — Vite middlewareMode through `connect()`, SSR in the `fallback`
 *   prod — built handler + `Bun.file` statics (the bridge is not involved)
 * They are different failure surfaces, so both matter.
 *
 * Tests 6 and 7 (server functions, multipart) were red in dev until the bridge
 * stopped draining `request.body` before the middleware chain ran — see
 * "leaves the request body readable for the fallback" in
 * packages/connect/src/index.test.ts, which is the unit-level guard.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { fromCrossJSON, toJSONAsync } from "seroval";
import {
  BROWSER_UA,
  buildProd,
  readChunks,
  startDevServer,
  startProdServer,
  type ServerHandle,
} from "./helpers";

const PIXEL_PATH = new URL("../public/pixel.png", import.meta.url).pathname;

/** Replicates the headers a browser's TanStack client sends for a server fn. */
function serverFnHeaders(extra: Record<string, string> = {}) {
  return {
    // TanStack's CSRF middleware rejects requests without a same-origin signal.
    "sec-fetch-site": "same-origin",
    "x-tsr-serverFn": "true",
    ...extra,
  };
}

/** Server fn results come back as seroval cross-JSON under `x-tss-serialized`. */
async function decodeServerFnResponse(response: Response) {
  const payload = await response.json();
  return fromCrossJSON(payload, { refs: new Map() }) as {
    result?: unknown;
    error?: unknown;
  };
}

/** The compiler-generated `/_serverFn/<id>` URLs, published by /serverfn. */
async function serverFnUrls(base: string) {
  const html = await (await fetch(`${base}/serverfn`)).text();
  const echo = html.match(/data-echo-url="([^"]+)"/)?.[1];
  const upload = html.match(/data-upload-url="([^"]+)"/)?.[1];

  if (!echo || !upload) {
    throw new Error(`could not find server fn URLs in /serverfn markup:\n${html}`);
  }

  return { echo, upload };
}

const modes = [
  { name: "dev", start: startDevServer, bridged: true },
  { name: "prod", start: startProdServer, bridged: false },
] as const;

for (const mode of modes) {
  describe(`tanstack features (${mode.name})`, () => {
    let server: ServerHandle;
    let base: string;


    beforeAll(async () => {
      if (mode.name === "prod") await buildProd();
      server = await mode.start();
      base = server.url;
    }, 300_000);

    afterAll(async () => {
      await server?.stop();
    });

    test("1. SSR renders the index route", async () => {
      const res = await fetch(`${base}/`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("E2E_ROOT");
      expect(html).toContain("E2E_INDEX");
    });

    test("2. streaming SSR: shell arrives before the deferred data", async () => {
      const res = await fetch(`${base}/deferred`, {
        headers: { "user-agent": BROWSER_UA },
      });

      expect(res.status).toBe(200);

      const { chunks, body } = await readChunks(res);

      // The shell must be a chunk of its own, flushed long before the
      // 300ms loader promise settles.
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]!.text).toContain("DEFERRED_SHELL");
      expect(chunks[0]!.text).toContain("DEFERRED_PENDING");
      expect(chunks[0]!.text).not.toContain("DEFERRED_DATA");

      // ...and the resolved value must still land in the same response.
      expect(body).toContain("DEFERRED_DATA");

      const resolvedAt = chunks.find((chunk) =>
        chunk.text.includes("DEFERRED_DATA"),
      )!;
      expect(resolvedAt.at - chunks[0]!.at).toBeGreaterThanOrEqual(150);
    });

    test("3. loader redirect is a real 302 + Location", async () => {
      const res = await fetch(`${base}/redirect`, { redirect: "manual" });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
      await res.arrayBuffer();
    });

    test("4. notFound() from a loader is a 404", async () => {
      const res = await fetch(`${base}/missing`);

      expect(res.status).toBe(404);
      expect(await res.text()).toContain("E2E_NOT_FOUND");
    });

    test("5. two Set-Cookie headers survive as two headers", async () => {
      const res = await fetch(`${base}/cookies`);

      expect(res.status).toBe(200);

      const cookies = res.headers.getSetCookie();
      expect(cookies).toHaveLength(2);
      expect(cookies).toContain("e2e_first=alpha; Path=/; HttpOnly");
      expect(cookies).toContain("e2e_second=beta; Path=/; SameSite=Lax");

      // A plain header set alongside them must survive too.
      expect(res.headers.get("x-e2e-custom")).toBe("custom-header-value");
      expect(await res.text()).toContain("COOKIES_SET");
    });

    test("6. server function (JSON RPC) round-trips its input", async () => {
      const { echo } = await serverFnUrls(base);

      const res = await fetch(`${base}${echo}`, {
        method: "POST",
        headers: serverFnHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(
          await toJSONAsync({ data: { name: "typeway", count: 21 } }),
        ),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("x-tss-serialized")).toBe("true");

      const decoded = await decodeServerFnResponse(res);
      expect(decoded.result).toEqual({
        echoed: "typeway",
        doubled: 42,
        marker: "ECHO_OK",
      });
    });

    test(
      "7. multipart upload reaches the server fn with the bytes intact",
      async () => {
        const { upload } = await serverFnUrls(base);

        const bytes = new Uint8Array(4096);
        bytes.fill(7);

        const form = new FormData();
        form.set("label", "MULTIPART_LABEL");
        form.set("file", new File([bytes], "blob.bin"));

        const res = await fetch(`${base}${upload}`, {
          method: "POST",
          headers: serverFnHeaders(),
          body: form,
        });

        expect(res.status).toBe(200);

        const decoded = await decodeServerFnResponse(res);
        expect(decoded.result).toEqual({
          label: "MULTIPART_LABEL",
          fileName: "blob.bin",
          byteLength: 4096,
          marker: "UPLOAD_OK",
        });
      },
    );

    test("8. binary static asset is byte-for-byte identical", async () => {
      const res = await fetch(`${base}/pixel.png`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");

      const served = new Uint8Array(await res.arrayBuffer());
      const onDisk = new Uint8Array(await Bun.file(PIXEL_PATH).arrayBuffer());

      expect(served.length).toBe(onDisk.length);
      expect(served).toEqual(onDisk);
    });

    test("9. SSE from a TanStack file server route streams event by event", async () => {
      const res = await fetch(`${base}/sse`, {
        headers: { accept: "text/event-stream" },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const { chunks, body } = await readChunks(res);

      expect(chunks[0]!.text).toContain("data: one");
      expect(chunks[0]!.text).not.toContain("data: two");
      expect(body).toContain("data: two");

      const second = chunks.find((chunk) => chunk.text.includes("data: two"))!;
      expect(second.at - chunks[0]!.at).toBeGreaterThanOrEqual(100);
    });

    test("9b. SSE from an Elysia route (bypasses the bridge) also streams", async () => {
      const res = await fetch(`${base}/api/sse`);

      expect(res.status).toBe(200);

      const { chunks, body } = await readChunks(res);

      expect(chunks[0]!.text).toContain("data: one");
      expect(chunks[0]!.text).not.toContain("data: two");
      expect(body).toContain("data: two");
    });

    test("10. bridge bypass control: /api/hello is served by Elysia", async () => {
      const res = await fetch(`${base}/api/hello?name=typeway`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: "Hello typeway" });
    });

    if (!mode.bridged) return;

    // ── bridge-only probes ────────────────────────────────────────────────
    // TanStack's responses are produced by `connect()`'s `fallback`, so they
    // never travel through BridgeResponse/BridgeRequest. These two hit a
    // Connect middleware mounted ahead of Vite (server/dev-bridge-probes.ts),
    // which is the only way to exercise the bridge's own invariants over a
    // real socket.

    test("11. BridgeResponse streams: Response resolves on the first write", async () => {
      const res = await fetch(`${base}/__bridge/stream`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const { chunks, body } = await readChunks(res);

      expect(chunks[0]!.text).toContain("data: one");
      expect(chunks[0]!.text).not.toContain("data: two");
      expect(body).toContain("data: two");

      const second = chunks.find((chunk) => chunk.text.includes("data: two"))!;
      expect(second.at - chunks[0]!.at).toBeGreaterThanOrEqual(100);
    });

    test("12. BridgeRequest forwards a raw, unparsed multipart body", async () => {
      const bytes = new Uint8Array(4096);
      bytes.fill(7);

      const form = new FormData();
      form.set("label", "MULTIPART_LABEL");
      form.set("file", new File([bytes], "blob.bin"));

      const res = await fetch(`${base}/__bridge/echo-body`, {
        method: "POST",
        body: form,
      });

      expect(res.status).toBe(200);

      const echo = (await res.json()) as {
        bytes: number;
        contentType: string | null;
        label: string | null;
      };

      // The middleware saw the untouched multipart envelope, boundary and all.
      expect(echo.contentType).toContain("multipart/form-data; boundary=");
      expect(echo.label).toBe("MULTIPART_LABEL");
      expect(echo.bytes).toBeGreaterThan(4096);
    });
  });
}
