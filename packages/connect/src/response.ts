import { Writable } from "node:stream";

const EMPTY_BODY_STATUSES = new Set([101, 204, 205, 304]);

type HeaderValue = number | string | string[];

/**
 * A `ServerResponse`-compatible `Writable` that resolves a web `Response`
 * as soon as the status and headers are final (first write, `flushHeaders`,
 * or `end`). Bodies stream through a `ReadableStream` — bytes are never
 * coerced to strings and the response is never buffered in full.
 */
export class BridgeResponse extends Writable {
	statusCode = 200;
	statusMessage = "";
	headersSent = false;

	#headers = new Map<string, { name: string; value: HeaderValue }>();
	#controller: ReadableStreamDefaultController<Uint8Array> | null = null;
	#resolve: (response: Response) => void;
	#reject: (error: unknown) => void;
	#resolved = false;

	constructor(
		resolve: (response: Response) => void,
		reject: (error: unknown) => void,
	) {
		super();
		this.#resolve = resolve;
		this.#reject = reject;
	}

	get resolved() {
		return this.#resolved;
	}

	// ---- header API ----

	setHeader(name: string, value: HeaderValue) {
		this.#headers.set(name.toLowerCase(), { name, value });
		return this;
	}

	appendHeader(name: string, value: string | string[]) {
		const existing = this.#headers.get(name.toLowerCase());
		if (!existing) return this.setHeader(name, value);

		const merged = [
			...(Array.isArray(existing.value)
				? existing.value
				: [String(existing.value)]),
			...(Array.isArray(value) ? value : [value]),
		];
		return this.setHeader(name, merged);
	}

	getHeader(name: string) {
		return this.#headers.get(name.toLowerCase())?.value;
	}

	getHeaders() {
		const headers: Record<string, HeaderValue> = {};
		for (const [key, { value }] of this.#headers) headers[key] = value;
		return headers;
	}

	getHeaderNames() {
		return [...this.#headers.keys()];
	}

	hasHeader(name: string) {
		return this.#headers.has(name.toLowerCase());
	}

	removeHeader(name: string) {
		this.#headers.delete(name.toLowerCase());
	}

	writeHead(
		statusCode: number,
		statusMessageOrHeaders?: string | Record<string, HeaderValue>,
		maybeHeaders?: Record<string, HeaderValue>,
	) {
		this.statusCode = statusCode;

		let headers: Record<string, HeaderValue> | undefined;
		if (typeof statusMessageOrHeaders === "string") {
			this.statusMessage = statusMessageOrHeaders;
			headers = maybeHeaders;
		} else {
			headers = statusMessageOrHeaders;
		}

		if (headers) {
			for (const [name, value] of Object.entries(headers)) {
				this.setHeader(name, value);
			}
		}

		this.headersSent = true;
		return this;
	}

	flushHeaders() {
		this.#ensureStream();
	}

	// ---- body ----

	_write(
		chunk: Uint8Array,
		_encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	) {
		if (EMPTY_BODY_STATUSES.has(this.statusCode)) {
			// e.g. a 304 with a stray body write: statuses that forbid bodies
			this.#resolveResponse(null);
			callback();
			return;
		}

		this.#ensureStream().enqueue(
			chunk instanceof Uint8Array ? chunk : Buffer.from(chunk),
		);
		callback();
	}

	_final(callback: (error?: Error | null) => void) {
		if (this.#controller) {
			this.#controller.close();
			this.#controller = null;
		} else {
			// ended without a single write
			this.#resolveResponse(null);
		}
		callback();
	}

	_destroy(
		error: Error | null,
		callback: (error?: Error | null) => void,
	) {
		if (this.#controller) {
			if (error) this.#controller.error(error);
			else this.#controller.close();
			this.#controller = null;
		} else if (error && !this.#resolved) {
			this.#resolved = true;
			this.#reject(error);
		}
		callback(error);
	}

	toHeaders() {
		const headers = new Headers();
		for (const { name, value } of this.#headers.values()) {
			if (Array.isArray(value)) {
				for (const entry of value) headers.append(name, String(entry));
			} else {
				headers.set(name, String(value));
			}
		}
		return headers;
	}

	#ensureStream() {
		if (!this.#controller) {
			let controller!: ReadableStreamDefaultController<Uint8Array>;
			const stream = new ReadableStream<Uint8Array>({
				start(c) {
					controller = c;
				},
			});
			this.#controller = controller;
			this.#resolveResponse(stream);
		}
		return this.#controller;
	}

	#resolveResponse(body: ReadableStream<Uint8Array> | null) {
		if (this.#resolved) return;
		this.#resolved = true;
		this.headersSent = true;

		this.#resolve(
			new Response(EMPTY_BODY_STATUSES.has(this.statusCode) ? null : body, {
				status: this.statusCode,
				statusText: this.statusMessage || undefined,
				headers: this.toHeaders(),
			}),
		);
	}
}
