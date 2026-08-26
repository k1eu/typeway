/**
 * Helpers for booting the real playground servers as subprocesses.
 *
 * Every server gets a fresh random port (PORT env) so parallel test files
 * never collide, and every spawned process is tracked so nothing leaks if a
 * test throws before its afterAll runs.
 */

import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const APP_DIR = new URL("..", import.meta.url).pathname

/** Every process this module spawned, so we can reap leftovers on exit. */
const live = new Set<Bun.Subprocess>()

let exitHooksInstalled = false

function installExitHooks() {
  if (exitHooksInstalled) return
  exitHooksInstalled = true
  const reap = () => {
    for (const proc of live) {
      try {
        proc.kill("SIGKILL")
      } catch {
        // already gone
      }
    }
    live.clear()
  }
  process.on("exit", reap)
  process.on("SIGINT", () => {
    reap()
    process.exit(130)
  })
  process.on("SIGTERM", () => {
    reap()
    process.exit(143)
  })
}

/** Ask the OS for a free port by binding :0 and immediately releasing it. */
async function freePort(): Promise<number> {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  })
  const port = listener.port
  listener.stop(true)
  return port
}

export interface ServerHandle {
  url: string
  port: number
  /** Everything the subprocess wrote to stdout+stderr so far. */
  output: () => string
  stop: () => Promise<void>
}

interface SpawnOptions {
  cmd: string[]
  env?: Record<string, string>
  /** How long to wait for the server to answer a request. */
  readyTimeoutMs?: number
  label: string
}

function drain(stream: ReadableStream<Uint8Array> | undefined, sink: string[]) {
  if (!stream) return
  const decoder = new TextDecoder()
  ;(async () => {
    try {
      for await (const chunk of stream) sink.push(decoder.decode(chunk))
    } catch {
      // stream closed with the process
    }
  })()
}

async function spawnServer({
  cmd,
  env,
  readyTimeoutMs = 60_000,
  label,
}: SpawnOptions): Promise<ServerHandle> {
  installExitHooks()

  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const logs: string[] = []
  // File-backed SQLite so Elysia's Bun process and Vite's SSR module graph
  // share users/sessions (and notes) — `:memory:` is per-connection.
  const databaseUrl =
    env?.DATABASE_URL ??
    join(mkdtempSync(join(tmpdir(), "tw-playground-")), "test.sqlite")

  const proc = Bun.spawn(cmd, {
    cwd: APP_DIR,
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_URL: env?.BETTER_AUTH_URL ?? url,
      BETTER_AUTH_SECRET:
        env?.BETTER_AUTH_SECRET ??
        "playground-better-auth-secret-key-do-not-use-in-prod",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  live.add(proc)
  drain(proc.stdout as ReadableStream<Uint8Array>, logs)
  drain(proc.stderr as ReadableStream<Uint8Array>, logs)

  const output = () => logs.join("")

  const stop = async () => {
    if (!live.has(proc)) return
    live.delete(proc)
    proc.kill()
    // Give it a moment to shut down cleanly, then be blunt about it.
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL")
      } catch {
        // already gone
      }
    }, 5_000)
    await proc.exited
    clearTimeout(timer)
  }

  const deadline = Date.now() + readyTimeoutMs
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      await stop()
      throw new Error(
        `${label} exited early (code ${proc.exitCode}) before serving ${url}\n--- output ---\n${output()}`,
      )
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      // Any HTTP answer means the listener is up.
      void res.body?.cancel()
      return { url, port, output, stop }
    } catch {
      await Bun.sleep(100)
    }
  }

  await stop()
  throw new Error(
    `${label} did not become ready on ${url} within ${readyTimeoutMs}ms\n--- output ---\n${output()}`,
  )
}

/**
 * Boot `server.dev.ts` (`viteDev()` — Vite middlewareMode through connect).
 * First boot re-optimizes deps, hence the generous default timeout.
 */
export function startDevServer(readyTimeoutMs = 90_000): Promise<ServerHandle> {
  return spawnServer({
    label: "dev server",
    cmd: ["bun", "--bun", "run", "server.dev.ts"],
    env: { NODE_ENV: "development" },
    readyTimeoutMs,
  })
}

/**
 * Run `bun run build` (vite client + ssr build, then `bun build` of
 * `server.prod.ts` into `dist/app`). Throws with the build log on failure.
 */
export async function buildApp(): Promise<void> {
  const proc = Bun.spawn(["bun", "run", "build"], {
    cwd: APP_DIR,
    env: { ...process.env, NODE_ENV: "production" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
    new Response(proc.stderr as ReadableStream<Uint8Array>).text(),
  ])
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`build failed (code ${code})\n${stdout}\n${stderr}`)
  }
}

/**
 * Boot the built production server. Assumes `buildApp()` (or `bun run build`)
 * already ran — `bun build` output is not executable, so it runs via `bun`.
 */
export function startProdServer(
  readyTimeoutMs = 30_000,
): Promise<ServerHandle> {
  return spawnServer({
    label: "prod server",
    cmd: ["bun", "dist/app"],
    env: { NODE_ENV: "production" },
    readyTimeoutMs,
  })
}

/** Absolute path inside the playground app (e.g. `appPath("dist/client")`). */
export function appPath(...segments: string[]): string {
  return [APP_DIR.replace(/\/$/, ""), ...segments].join("/")
}
