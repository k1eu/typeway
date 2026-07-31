import { Elysia } from "elysia";
import { runMiddlewares } from "./chain";
import { createBridgeRequest } from "./request";
import { BridgeResponse } from "./response";
import type { ConnectMiddleware, ConnectOptions } from "./types";

export type { ConnectMiddleware, ConnectOptions, NextFunction } from "./types";

/**
 * Hosts Connect/Express-style middleware (e.g. `viteDevServer.middlewares`)
 * under Elysia.
 *
 * Registered as a wildcard route, not a global hook — routes defined on the
 * app (e.g. `/api/...`) take precedence and never touch the bridge. When all
 * middleware passes through via `next()`, `options.fallback` produces the
 * response (default: 404), with any middleware-set headers merged in.
 */
export function connect(
	middleware: ConnectMiddleware | ConnectMiddleware[],
	options: ConnectOptions = {},
) {
	const middlewares = Array.isArray(middleware) ? middleware : [middleware];

	function handle(request: Request) {
		return new Promise<Response | BridgeResponse>((resolve, reject) => {
			const req = createBridgeRequest(request);
			const res = new BridgeResponse(resolve, reject);

			runMiddlewares(middlewares, req, res as never, (err) => {
				if (err) reject(err);
				// fell through: hand back the res so headers can be merged
				else resolve(res);
			});
		});
	}

	return new Elysia({ name: "@typeway/connect", seed: middlewares }).all(
		"*",
		async ({ request }) => {
			const result = await handle(request);
			if (result instanceof Response) return result;

			const headers = result.toHeaders();
			const fallback = options.fallback
				? await options.fallback(request)
				: new Response("Not Found", { status: 404 });

			const response = new Response(fallback.body, fallback);
			for (const [key, value] of headers) {
				if (key === "set-cookie") response.headers.append(key, value);
				else response.headers.set(key, value);
			}

			return response;
		},
	);
}
