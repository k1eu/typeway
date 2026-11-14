import { CliError } from "./errors";
import type { IO } from "./io";

export function printJson(io: IO, value: unknown) {
	io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printError(io: IO, json: boolean, error: CliError) {
	if (json) {
		printJson(io, { ok: false, error: error.toJSON() });
		return;
	}
	io.stderr.write(`error: ${error.code}: ${error.message}\n`);
	io.stderr.write(`See ${error.docs}\n`);
}
