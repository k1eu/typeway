#!/usr/bin/env bun
import { parseArgv, type ParsedArgv } from "./argv";
import { runBuild } from "./build";
import { runDev } from "./dev";
import { CliError, EXIT } from "./errors";
import { defaultIo, type IO } from "./io";
import { printError } from "./json";
import { runGenerate } from "./generate";
import { runModels } from "./models";
import { runNew } from "./new";
import {
	findCommandHelp,
	printCommandHelp,
	printRootHelp,
	printVersion,
} from "./help";
import { runRoutes } from "./routes";
import { runStart } from "./start";

export { parseArgv } from "./argv";
export { introspectRoutes } from "./routes";
export { runNew } from "./new";

async function dispatch(parsed: ParsedArgv, io: IO): Promise<number> {
	if (parsed.version && (parsed.command === null || parsed.help)) {
		printVersion(io, parsed.json);
		return EXIT.ok;
	}

	if (parsed.command === "help") {
		const target = parsed.args[0];
		if (!target) {
			printRootHelp(io, parsed.json);
			return EXIT.ok;
		}
		const help = findCommandHelp(target);
		if (!help) {
			throw new CliError(
				"typeway.unknown_command",
				`Unknown command "${target}". Run typeway --help.`,
			);
		}
		printCommandHelp(io, parsed.json, help);
		return EXIT.ok;
	}

	if (parsed.help || parsed.command === null) {
		if (parsed.command) {
			const help = findCommandHelp(parsed.command);
			if (help) {
				printCommandHelp(io, parsed.json, help);
				return EXIT.ok;
			}
		}
		if (parsed.version) {
			printVersion(io, parsed.json);
			return EXIT.ok;
		}
		printRootHelp(io, parsed.json);
		return EXIT.ok;
	}

	if (parsed.version) {
		printVersion(io, parsed.json);
		return EXIT.ok;
	}

	switch (parsed.command) {
		case "new":
			return runNew(io, parsed);
		case "dev":
			return runDev(io, parsed);
		case "build":
			return runBuild(io, parsed);
		case "start":
			return runStart(io, parsed);
		case "routes":
			return runRoutes(io, parsed);
		case "generate":
			return runGenerate(io, parsed);
		case "models":
			return runModels(io, parsed);
		default: {
			const _never: never = parsed.command;
			throw new CliError(
				"typeway.unknown_command",
				`Unknown command "${_never}".`,
			);
		}
	}
}

export async function run(argv: string[], io: IO = defaultIo()): Promise<number> {
	try {
		const parsed = parseArgv(argv);
		return await dispatch(parsed, io);
	} catch (error) {
		if (error instanceof CliError) {
			const json = argv.includes("--json");
			printError(io, json, error);
			return error.exitCode;
		}
		throw error;
	}
}

if (import.meta.main) {
	process.exit(await run(process.argv.slice(2)));
}
