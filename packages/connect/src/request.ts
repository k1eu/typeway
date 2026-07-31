import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

// Some express-flavored middleware probes `req.app.get(...)` for settings.
const appStub = { get: () => false };

/**
 * Builds an `IncomingMessage`-compatible object from a web `Request`.
 * The body is forwarded as a raw stream, so body-parsing middleware
 * (JSON, urlencoded, multipart) works exactly as it does under Node.
 */
export function createBridgeRequest(request: Request): IncomingMessage {
	const url = new URL(request.url);

	const query: Record<string, unknown> = {};
	for (const [key, value] of url.searchParams) {
		query[key] = value;
	}

	const headers: Record<string, string> = {};
	const rawHeaders: string[] = [];
	for (const [key, value] of request.headers) {
		headers[key] = value;
		rawHeaders.push(key, value);
	}

	const req = request.body
		? Readable.fromWeb(request.body as never)
		: Readable.from([]);

	const socket = {
		remoteAddress: "127.0.0.1",
		remotePort: 0,
		encrypted: url.protocol === "https:",
		writable: true,
		readable: true,
		destroy() {},
	};

	Object.assign(req, {
		method: request.method.toUpperCase(),
		url: url.pathname + url.search,
		originalUrl: url.pathname + url.search,
		path: url.pathname,
		baseUrl: "",
		query,
		headers,
		rawHeaders,
		httpVersion: "1.1",
		httpVersionMajor: 1,
		httpVersionMinor: 1,
		socket,
		connection: socket,
		app: appStub,
	});

	return req as unknown as IncomingMessage;
}
