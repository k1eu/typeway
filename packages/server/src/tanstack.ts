import { connect, type ConnectMiddleware } from "@typeway/connect";
import { join } from "node:path";
import type { ViteDevServer } from "vite";
import {
	DEFAULT_CLIENT_DIR,
	DEFAULT_SSR_ENTRY,
} from "./defaults";
import { serveClientAssets } from "./static";
import type {
	FetchHandler,
	FrontendAdapter,
	HostApp,
} from "./types";

export type TanStackOptions = {
	/**
	 * SSR module loaded through Vite's per-environment runner.
	 * Default: `./src/server.ts` — the name TanStack's Vite plugin already
	 * treats as the SSR build input.
	 */
	entry?: string;
	/**
	 * Built TanStack/Vite SSR handler. Required in production. Import it
	 * with a *literal* specifier (`await import("./dist/server/server.js")`)
	 * in the boot file so `bun build --target bun` can inline it.
	 */
	handler?: FetchHandler;
	/**
	 * Extra Connect middleware run *before* Vite (e.g. test probes that
	 * must exercise the bridge rather than the SSR fallback).
	 */
	middleware?: ConnectMiddleware | ConnectMiddleware[];
	/**
	 * Client build output, relative to `distDir` unless absolute.
	 * Default: `client` → `./dist/client`.
	 */
	clientDir?: string;
};

type RunnableSsr = {
	runner: {
		import: (id: string) => Promise<{ default: FetchHandler }>;
	};
};

/**
 * Duck-typed equivalent of Vite's `isRunnableDevEnvironment`. Checking
 * `runner.import` here keeps `vite` as an `import type` in this module so
 * a prod `bun build` of `dist/app` never pulls Vite or rolldown.
 */
function asRunnableSsr(ssr: unknown): RunnableSsr {
	const runner = (ssr as { runner?: { import?: unknown } } | undefined)
		?.runner;
	if (typeof runner?.import !== "function") {
		throw new Error(
			"Vite's `ssr` environment is not runnable — cannot load the server entry.",
		);
	}
	return ssr as RunnableSsr;
}

function extraMiddleware(
	middleware: TanStackOptions["middleware"],
): ConnectMiddleware[] {
	if (!middleware) return [];
	return Array.isArray(middleware) ? middleware : [middleware];
}

/**
 * TanStack Start adapter: Vite SSR in the `connect()` fallback in dev, a
 * boot-time `dist/client` manifest + `.mount()` of the built handler in prod.
 *
 * No `@tanstack/react-start` dependency — the adapter loads `./src/server.ts`
 * (dev) / the built handler (prod) by path. The app owns `src/server.ts`.
 */
export function tanstack(options: TanStackOptions = {}): FrontendAdapter {
	const entry = options.entry ?? DEFAULT_SSR_ENTRY;

	return {
		name: "tanstack",
		build: {
			entry,
			client: options.clientDir ?? DEFAULT_CLIENT_DIR,
			handler: "server/server.js",
		},
		async dev(vite: ViteDevServer, app: HostApp) {
			const ssrEnv = asRunnableSsr(vite.environments.ssr);

			app.use(
				connect([...extraMiddleware(options.middleware), vite.middlewares], {
					fallback: async (request) => {
						try {
							const { default: serverEntry } =
								await ssrEnv.runner.import(entry);
							return serverEntry.fetch(request);
						} catch (error) {
							if (error instanceof Error) vite.ssrFixStacktrace(error);
							console.error(error);
							return new Response("Internal Server Error", { status: 500 });
						}
					},
				}),
			);
		},
		async prod(app: HostApp, distDir: string) {
			const handler = options.handler;
			if (!handler) {
				throw new Error(
					"tanstack({ handler }) is required in production — import ./dist/server/server.js with a literal specifier so bun build can inline it.",
				);
			}

			const clientDir = options.clientDir ?? join(distDir, DEFAULT_CLIENT_DIR);
			await serveClientAssets(app, clientDir);
			app.mount((request: Request) => handler.fetch(request));
		},
	};
}
