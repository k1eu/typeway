import type { IncomingMessage, ServerResponse } from "node:http";

export type NextFunction = (err?: unknown) => void;

export type ConnectMiddleware = (
	req: IncomingMessage,
	res: ServerResponse,
	next: NextFunction,
) => unknown;

export interface ConnectOptions {
	/**
	 * Called when every middleware passed through via `next()` without
	 * responding. Headers set by middleware are merged onto the returned
	 * response. Defaults to a plain 404.
	 */
	fallback?: (request: Request) => Response | Promise<Response>;
}
