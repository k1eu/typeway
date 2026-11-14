import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assertNoDryRun, assertNoForce } from "./argv";
import { CliError, EXIT } from "./errors";
import type { IO } from "./io";
import { printJson } from "./json";
import { readManifest, type ManifestModel } from "./generate/manifest";

function scanModels(cwd: string): ManifestModel[] {
	const dir = join(cwd, "app/models");
	if (!existsSync(dir)) return [];
	const models: ManifestModel[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith(".ts")) continue;
		if (entry.name.endsWith(".test.ts")) continue;
		const singular = entry.name.replace(/\.ts$/, "");
		const pluralGuess = `${singular}s`;
		const schemaPlural = existsSync(join(cwd, "db/schema", `${pluralGuess}.ts`))
			? pluralGuess
			: existsSync(join(cwd, "db/schema", `${singular}.ts`))
				? singular
				: pluralGuess;
		const pascal = singular
			.split("-")
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join("");
		models.push({
			name: pascal,
			singular,
			plural: schemaPlural,
			file: `app/models/${entry.name}`,
			table: schemaPlural.replace(/-/g, "_"),
			schema: `db/schema/${schemaPlural}.ts`,
			factory: `db/factories/${singular}.ts`,
			fields: [],
		});
	}
	models.sort((a, b) => a.name.localeCompare(b.name));
	return models;
}

export function listModels(cwd: string): ManifestModel[] {
	const manifest = readManifest(cwd);
	if (manifest && manifest.models.length > 0) return manifest.models;
	return scanModels(cwd);
}

export async function runModels(
	io: IO,
	opts: { json: boolean; dryRun: boolean; force: boolean },
): Promise<number> {
	assertNoDryRun("models", opts.dryRun);
	assertNoForce("models", opts.force);
	if (!existsSync(join(io.cwd, "app")) && !existsSync(join(io.cwd, "server/app.ts"))) {
		throw new CliError(
			"typeway.models.unreadable",
			"Cannot find app/models — run this from a Typeway app.",
			{ path: "app/models" },
		);
	}

	const models = listModels(io.cwd);
	if (opts.json) {
		printJson(io, { ok: true, models });
	} else {
		if (models.length === 0) {
			io.stdout.write("(no models)\n");
		} else {
			for (const model of models) {
				io.stdout.write(`${model.name}  ${model.file}  ${model.schema}\n`);
			}
		}
	}
	return EXIT.ok;
}
