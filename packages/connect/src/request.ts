import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

// Some express-flavored middleware probes `req.app.get(...)` for settings.
const appStub = { get: () => false };

/**
 * A `Readable` over a web body that does not touch the source until something
 * actually reads it — `Readable.fromWeb` runs on the first `_read`, not up
 * front, so an unread body reaches `options.fallback` still unlocked.
 *
 * The wrapper defers the *native* reader rather than replacing it. Two lazy
 * alternatives were measured and rejected: `Readable.from(asyncGenerator)` and
 * a hand-rolled `reader.read()` pull loop both cost ~2.4x on the body path
 * (27k -> 11k req/s), because they swap Bun's native path for JS plumbing.
 * This shape measures within noise of the original eager version.
 * Benchmark: `bun bench/run.ts --only bridge-res-end-post`.
 */
function lazyBody(body: ReadableStream<Uint8Array>): Readable {
	let source: Readable | undefined;

	return new Readable({
		read() {
			if (source) {
				source.resume();
				return;
			}

			source = Readable.fromWeb(body as never);
			source.on("data", (chunk) => {
				if (!this.push(chunk)) source?.pause();
			});
			source.on("end", () => this.push(null));
			source.on("error", (error) => this.destroy(error));
		},
	});
}

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

	// Lazily drained, so a Request whose body no middleware consumed reaches
	// `options.fallback` unlocked. Draining eagerly (e.g. `Readable.fromWeb`)
	// locks the web stream up front, which makes every fallback-rendered POST
	// fail with "Body already used" — SSR in the fallback is the common setup.
	const req = request.body
		? lazyBody(request.body as ReadableStream<Uint8Array>)
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
