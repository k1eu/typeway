import { CliError } from "./errors";

export const COMMANDS = [
	"new",
	"dev",
	"build",
	"start",
	"routes",
	"help",
] as const;

export type CommandName = (typeof COMMANDS)[number];

export type ParsedArgv = {
	command: CommandName | null;
	args: string[];
	json: boolean;
	dryRun: boolean;
	force: boolean;
	help: boolean;
	version: boolean;
	workspace: boolean;
};

const COMMAND_SET = new Set<string>(COMMANDS);

function isFlag(token: string) {
	return token.startsWith("-");
}

export function parseArgv(argv: string[]): ParsedArgv {
	const parsed: ParsedArgv = {
		command: null,
		args: [],
		json: false,
		dryRun: false,
		force: false,
		help: false,
		version: false,
		workspace: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]!;
		if (!isFlag(token)) {
			if (parsed.command === null) {
				if (token === "generate" || token === "models") {
					throw new CliError(
						"typeway.unknown_command",
						`"${token}" is not implemented yet — slice 1 is new/dev/build/start/routes. See plans/05-cli-and-generators.md.`,
					);
				}
				if (!COMMAND_SET.has(token)) {
					throw new CliError(
						"typeway.unknown_command",
						`Unknown command "${token}". Run typeway --help.`,
					);
				}
				parsed.command = token as CommandName;
			} else {
				parsed.args.push(token);
			}
			continue;
		}

		switch (token) {
			case "--json":
				parsed.json = true;
				break;
			case "--dry-run":
				parsed.dryRun = true;
				break;
			case "--force":
				parsed.force = true;
				break;
			case "--help":
			case "-h":
				parsed.help = true;
				break;
			case "--version":
			case "-v":
				parsed.version = true;
				break;
			case "--workspace":
				parsed.workspace = true;
				break;
			default:
				throw new CliError(
					"typeway.usage",
					`Unknown flag "${token}". Run typeway --help.`,
				);
		}
	}

	return parsed;
}

export function assertNoDryRun(command: string, dryRun: boolean) {
	if (dryRun) {
		throw new CliError(
			"typeway.usage",
			`--dry-run is only valid for commands that write files (got "${command}").`,
		);
	}
}

export function assertNoForce(command: string, force: boolean) {
	if (force) {
		throw new CliError(
			"typeway.usage",
			`--force is only valid for typeway new (got "${command}").`,
		);
	}
}
