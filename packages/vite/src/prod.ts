import { existsSync } from "node:fs";
import { Elysia } from "elysia";
import { DEFAULT_CLIENT_DIR } from "./defaults";

export type FetchHandler = {
	fetch(request: Request): Response | Promise<Response>;
};

export type ViteProdOptions = {
	/**
	 * Built TanStack/Vite SSR handler. Import it with a *literal* specifier
	 * (`await import("./dist/server/server.js")`) in the boot file so
	 * `bun build --target bun` can inline it. See `DEFAULT_SSR_ENTRY`.
	 */
	handler: FetchHandler;
	/** Client build output. Default: `./dist/client`. */
	clientDir?: string;
};

/**
 * Production host: a boot-time manifest of `dist/client` as real Elysia
 * routes, plus `.mount()` of the built fetch-native SSR handler.
 *
 * Walking the tree once is cheaper and more honest than a per-request
 * `exists()` wildcard — page navigations never pay a filesystem miss, and
 * a missing `dist/client` fails at boot instead of looking fine while
 * serving no JS or CSS.
 *
 * `.all` rather than `.get` so HEAD matches the old wildcard. Prerendered
 * pages land as `<route>/index.html`; nobody requests them under that name,
 * so the directory form (`/rendering/ssg` and `/rendering/ssg/`) is
 * registered too. Otherwise the request falls through to SSR and the page
 * is rendered again per request — the opposite of prerendering it.
 *
 * `.mount()` is Elysia's own entry for a fetch-native handler (~0.4 µs).
 * The connect bridge is for Vite's dev middleware, not for something that
 * already speaks `Request`/`Response`.
 */
export async function viteProd(options: ViteProdOptions) {
	const clientDir = options.clientDir ?? DEFAULT_CLIENT_DIR;

	if (!existsSync(clientDir)) {
		throw new Error(
			`Could not read ${clientDir} — run \`bun run build\` before \`bun run start\`.`,
		);
	}

	let files: string[];
	try {
		files = await Array.fromAsync(
			new Bun.Glob("**/*").scan({ cwd: clientDir, onlyFiles: true }),
		);
	} catch (error) {
		throw new Error(
			`Could not read ${clientDir} — run \`bun run build\` before \`bun run start\`.`,
			{ cause: error },
		);
	}

	const app = new Elysia({ name: "@typeway/vite" });

	for (const file of files) {
		const path = `/${file}`;
		const source = `${clientDir}/${file}`;
		app.all(path, () => new Response(Bun.file(source)));

		if (file.endsWith("index.html")) {
			const dir = path.slice(0, -"index.html".length); // keeps the trailing slash
			const clean = dir === "/" ? "/" : dir.slice(0, -1);
			app.all(clean, () => new Response(Bun.file(source)));
			if (clean !== "/") app.all(dir, () => new Response(Bun.file(source)));
		}
	}

	app.mount((request) => options.handler.fetch(request));

	return app;
}
