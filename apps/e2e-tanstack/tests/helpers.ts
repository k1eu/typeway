/**
 * Server-boot helpers for the e2e fixture app.
 *
 * NOTE: plan 01 (`01-integration-smoke-test.md`) ships an equivalent
 * start-dev/start-prod helper for the playground smoke suite. Once both land,
 * these should be deduped into one shared location (e.g. a `packages/test-kit`
 * or a shared `tests` dir under `apps`). Kept self-contained here so plan 02
 * does not block on plan 01.
 */

const APP_DIR = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

export type ServerHandle = {
  /** e.g. `http://localhost:41234` — no trailing slash. */
  url: string;
  stop: () => Promise<void>;
};

/** A browser-ish UA. TanStack Start's SSR waits for `allReady` when `isbot()`
 *  matches the User-Agent, which disables streaming — Bun's default
 *  `Bun/x.y.z` UA and curl both trip that. Any streaming assertion must send
 *  this. */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Grab an OS-assigned free port by binding and immediately releasing it. */
function freePort(): number {
  const server = Bun.serve({ port: 0, fetch: () => new Response("ok") });
  const port = Number(server.port);
  server.stop(true);
  return port;
}

async function waitForReady(
  url: string,
  proc: Bun.Subprocess,
  timeoutMs: number,
  label: string,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      throw new Error(
        `${label} server exited before becoming ready ` +
          `(code=${proc.exitCode} signal=${proc.signalCode})`,
      );
    }

    try {
      const res = await fetch(`${url}/api/hello`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) {
        await res.arrayBuffer();
        return;
      }
    } catch {
      // not listening yet
    }

    await Bun.sleep(100);
  }

  throw new Error(`${label} server did not become ready within ${timeoutMs}ms`);
}

function makeStop(proc: Bun.Subprocess): () => Promise<void> {
  let stopped = false;

  return async () => {
    if (stopped) return;
    stopped = true;

    if (proc.exitCode !== null || proc.signalCode !== null) return;

    proc.kill("SIGTERM");
    const exited = await Promise.race([
      proc.exited.then(() => true),
      Bun.sleep(5_000).then(() => false),
    ]);
    if (!exited) {
      proc.kill("SIGKILL");
      await proc.exited;
    }
  };
}

/** Vite dev server in middlewareMode, hosted under Elysia via `viteDev()`. */
export async function startDevServer(): Promise<ServerHandle> {
  const port = freePort();
  // Vite's HMR websocket defaults to a fixed port (24678); randomize it so
  // parallel suites never collide.
  const hmrPort = freePort();
  const url = `http://localhost:${port}`;

  const proc = Bun.spawn(["bun", "--bun", "run", "server.dev.ts"], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      HMR_PORT: String(hmrPort),
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  try {
    await waitForReady(url, proc, 120_000, "dev");
  } catch (error) {
    proc.kill("SIGKILL");
    throw error;
  }

  return { url, stop: makeStop(proc) };
}

/** `vite build` + `bun build`; run once before `startProdServer`. */
export async function buildProd(): Promise<void> {
  const proc = Bun.spawn(["bun", "run", "build"], {
    cwd: APP_DIR,
    env: { ...process.env, NODE_ENV: "production" },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`prod build failed (exit ${exitCode})\n${stdout}\n${stderr}`);
  }
}

/** Built TanStack handler + `Bun.file` statics under Elysia (no bridge). */
export async function startProdServer(): Promise<ServerHandle> {
  const port = freePort();
  const url = `http://localhost:${port}`;

  // `bun build` output is not executable — it must be run through `bun`.
  const proc = Bun.spawn(["bun", "dist/app"], {
    cwd: APP_DIR,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
    stdout: "pipe",
    stderr: "pipe",
  });

  try {
    await waitForReady(url, proc, 30_000, "prod");
  } catch (error) {
    proc.kill("SIGKILL");
    throw error;
  }

  return { url, stop: makeStop(proc) };
}

/** Read a response body chunk-by-chunk, recording arrival times. */
export async function readChunks(
  response: Response,
): Promise<{ chunks: Array<{ text: string; at: number }>; body: string }> {
  if (!response.body) throw new Error("response has no body");

  const started = Date.now();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Array<{ text: string; at: number }> = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push({
      text: decoder.decode(value, { stream: true }),
      at: Date.now() - started,
    });
  }

  const tail = decoder.decode();
  if (tail) chunks.push({ text: tail, at: Date.now() - started });

  return { chunks, body: chunks.map((chunk) => chunk.text).join("") };
}
