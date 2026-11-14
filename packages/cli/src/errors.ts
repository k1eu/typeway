export const DOCS_BASE = "https://typeway.dev/errors";

export type CliErrorBody = {
	code: string;
	message: string;
	docs: string;
	path?: string;
};

export class CliError extends Error {
	readonly code: string;
	readonly docs: string;
	readonly path?: string;
	readonly exitCode: number;

	constructor(
		code: string,
		message: string,
		options: { path?: string; exitCode?: number } = {},
	) {
		super(message);
		this.name = "CliError";
		this.code = code;
		this.docs = `${DOCS_BASE}/${code}`;
		this.path = options.path;
		this.exitCode = options.exitCode ?? 1;
	}

	toJSON(): CliErrorBody {
		const body: CliErrorBody = {
			code: this.code,
			message: this.message,
			docs: this.docs,
		};
		if (this.path) body.path = this.path;
		return body;
	}
}

export const EXIT = {
	ok: 0,
	usage: 1,
	write: 2,
	testFailed: 3,
} as const;
