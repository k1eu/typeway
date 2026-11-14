import type { CommandName } from "./argv";
import type { IO } from "./io";
import { printJson } from "./json";

export const VERSION = "0.1.0";

export type CommandHelp = {
	name: CommandName;
	usage: string;
	description: string;
	flags: { flag: string; description: string }[];
};

export const COMMAND_HELP: CommandHelp[] = [
	{
		name: "new",
		usage: "typeway new <dir>",
		description:
			"Scaffold a Typeway app (app/ config/ db/ server/ src/) matching docs/conventions.md.",
		flags: [
			{ flag: "--dry-run", description: "Print the write list; create nothing" },
			{ flag: "--force", description: "Overwrite an existing directory" },
			{
				flag: "--workspace",
				description:
					'Write workspace:* for @typeway/server and typeway (use inside a Bun workspace)',
			},
			{ flag: "--json", description: "Machine-readable write list" },
		],
	},
	{
		name: "dev",
		usage: "typeway dev",
		description:
			"Alias for `bun --bun --watch run server.dev.ts`. Forwards PORT and HMR_PORT.",
		flags: [{ flag: "--json", description: "JSON errors if server.dev.ts is missing" }],
	},
	{
		name: "build",
		usage: "typeway build",
		description:
			"Alias for `bun run build` (vite client + SSR, then bun build of server.prod.ts).",
		flags: [{ flag: "--json", description: "JSON errors if the build script is missing" }],
	},
	{
		name: "start",
		usage: "typeway start",
		description: "Run `bun dist/app` after asserting dist/app exists. Respects PORT.",
		flags: [{ flag: "--json", description: "JSON errors if dist/app is missing" }],
	},
	{
		name: "routes",
		usage: "typeway routes [--json]",
		description:
			"Print the Elysia route table from server/app.ts (method, path, schemas).",
		flags: [{ flag: "--json", description: "Stable JSON contract for agents" }],
	},
	{
		name: "generate",
		usage: "typeway generate model|resource <Name> [field:type ...]",
		description:
			"Scaffold a Drizzle model, or a five-action Elysia resource + Eden pages.",
		flags: [
			{ flag: "--dry-run", description: "Print the write list; create nothing" },
			{ flag: "--json", description: "Machine-readable write list" },
			{ flag: "--force", description: "Overwrite existing generated files" },
			{
				flag: "--plural <name>",
				description: "Override default plural (name + \"s\")",
			},
			{
				flag: "--write-agents",
				description: "Insert the managed AGENTS.md block if markers are missing",
			},
			{
				flag: "--skip-test",
				description: "Do not run the generated bun:test files before exit 0",
			},
		],
	},
	{
		name: "models",
		usage: "typeway models [--json]",
		description:
			"List models from .typeway/generate.json (or scan app/models/).",
		flags: [{ flag: "--json", description: "Stable JSON contract for agents" }],
	},
	{
		name: "help",
		usage: "typeway help [command]",
		description: "Show this help, or help for one command.",
		flags: [{ flag: "--json", description: "Print { ok, commands } / { ok, command }" }],
	},
];

const GLOBAL_FLAGS = [
	{ flag: "--json", description: "Machine-readable output on stdout" },
	{ flag: "--help, -h", description: "Show help" },
	{ flag: "--version, -v", description: "Print the CLI version" },
];

export function findCommandHelp(name: string): CommandHelp | undefined {
	return COMMAND_HELP.find((c) => c.name === name);
}

export function printRootHelp(io: IO, json: boolean) {
	if (json) {
		printJson(io, {
			ok: true,
			version: VERSION,
			commands: COMMAND_HELP.map(({ name, usage, description }) => ({
				name,
				usage,
				description,
			})),
		});
		return;
	}

	const lines = [
		"typeway — conventions CLI for Typeway apps",
		"",
		"Usage:",
		"  typeway <command> [options]",
		"",
		"Commands:",
		...COMMAND_HELP.map(
			(c) => `  ${c.name.padEnd(12)} ${c.description}`,
		),
		"",
		"Global flags:",
		...GLOBAL_FLAGS.map((f) => `  ${f.flag.padEnd(16)} ${f.description}`),
		"",
		"Run `typeway <command> --help` for command flags.",
		"Docs: https://typeway.dev/errors  (catalog: docs/errors.md)",
		"",
	];
	io.stdout.write(lines.join("\n"));
}

export function printCommandHelp(io: IO, json: boolean, help: CommandHelp) {
	if (json) {
		printJson(io, { ok: true, command: help });
		return;
	}

	const lines = [
		help.usage,
		"",
		help.description,
		"",
		"Flags:",
		...help.flags.map((f) => `  ${f.flag.padEnd(16)} ${f.description}`),
		"  --help, -h       Show this help",
		"",
	];
	io.stdout.write(lines.join("\n"));
}

export function printVersion(io: IO, json: boolean) {
	if (json) {
		printJson(io, { ok: true, version: VERSION });
		return;
	}
	io.stdout.write(`typeway ${VERSION}\n`);
}
