import { Elysia } from "elysia";
import { backend } from "./server/app";
import { authPlugin } from "./server/auth-plugin";
import { listen } from "./server/listen";

const CLIENT_DIR = "./dist/client";

const app = new Elysia().use(authPlugin).use(backend);

// Production: load the pre-built TanStack Start handler. The specifier must
// stay literal — see ./server/entry.ts for why.
// @ts-ignore built output only exists after `bun run build`
const { default: handler } = await import("./dist/server/server.js");

/**
 * Static assets become real registered routes, enumerated once at boot.
 *
 * The previous shape was a single `.all("*")` that ran `Bun.file(...).exists()`
 * on every request — a filesystem stat per request, and one that *always* misses
 * for page navigations, which are the requests that can least afford it. The
 * contents of `dist/client` are fixed at build time, so walking it once and
 * registering what is actually there is both cheaper (no per-request syscall,
 * and matching happens in Elysia's compiled static router) and more honest: the
 * set of served files is declared rather than probed.
 *
 * `.all` rather than `.get` so HEAD and friends behave exactly as they did under
 * the old wildcard.
 */
let files: string[];
try {
  files = await Array.fromAsync(
    new Bun.Glob("**/*").scan({ cwd: CLIENT_DIR, onlyFiles: true }),
  );
} catch (error) {
  // Fail loudly. The old per-request `exists()` check degraded silently here:
  // with no `dist/client`, every asset request fell through to SSR and the app
  // came up looking fine but serving no JS or CSS.
  throw new Error(
    `Could not read ${CLIENT_DIR} — run \`bun run build\` before \`bun run start\`.`,
    { cause: error },
  );
}

for (const file of files) {
  const path = `/${file}`;
  const source = `${CLIENT_DIR}/${file}`;
  app.all(path, () => new Response(Bun.file(source)));

  /**
   * Prerendered pages (see `pages` in vite.config.ts) land here as
   * `<route>/index.html`, but nobody requests them under that name — they are
   * requested as `/rendering/ssg`. Register the directory form too, otherwise
   * the request falls through to the SSR mount below and the page is rendered
   * again per request, which is precisely what prerendering it was meant to
   * avoid.
   */
  if (file.endsWith("index.html")) {
    const dir = path.slice(0, -"index.html".length); // keeps the trailing slash
    const clean = dir === "/" ? "/" : dir.slice(0, -1);
    app.all(clean, () => new Response(Bun.file(source)));
    if (clean !== "/") app.all(dir, () => new Response(Bun.file(source)));
  }
}

/**
 * Everything else is SSR. `.mount()` is Elysia's own entry point for a
 * fetch-native handler — exactly what TanStack Start's build emits
 * (`{ fetch(request: Request): Promise<Response> }`) — so this needs no bridge
 * and no hand-rolled wildcard. Elysia gives the asset routes above precedence
 * over the mount's wildcard, the same route-precedence rule `@typeway/connect`
 * relies on.
 */
app.mount((request) => handler.fetch(request));

const port = Number(process.env.PORT ?? 3000);

listen(app, port, ({ port: bound }) =>
  console.log(
    `Server running on localhost:${bound} ` +
      `(${files.length} static assets, SSR mounted)`,
  ),
);
