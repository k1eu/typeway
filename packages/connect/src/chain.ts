import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConnectMiddleware, NextFunction } from "./types";

type ErrorMiddleware = (
	err: unknown,
	req: IncomingMessage,
	res: ServerResponse,
	next: NextFunction,
) => unknown;

/**
 * Runs middleware in sequence with Connect semantics: `next()` advances,
 * `next(err)` (or a throw) skips to the next 4-arity error handler,
 * and `done(err)` fires when the chain is exhausted.
 */
export function runMiddlewares(
	middlewares: ConnectMiddleware[],
	req: IncomingMessage,
	res: ServerResponse,
	done: (err?: unknown) => void,
) {
	let index = 0;

	const next: NextFunction = (err?: unknown) => {
		while (index < middlewares.length) {
			const middleware = middlewares[index++];
			const isErrorHandler = middleware.length >= 4;

			if (err ? !isErrorHandler : isErrorHandler) continue;

			try {
				if (err) {
					(middleware as unknown as ErrorMiddleware)(err, req, res, next);
				} else {
					middleware(req, res, next);
				}
			} catch (thrown) {
				next(thrown);
			}
			return;
		}

		done(err);
	};

	next();
}
