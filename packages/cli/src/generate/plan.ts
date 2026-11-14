import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CliError } from "../errors";
import { planFileList, type PlannedFile } from "../template";
import { managedAgentsBlock, llmsInventory } from "./agents-md";
import type { FieldSpec } from "./fields";
import {
	emptyManifest,
	MANIFEST_PATH,
	readManifest,
	serializeManifest,
	upsertModel,
	upsertResource,
	type GenerateManifest,
} from "./manifest";
import type { ResourceNames } from "./names";
import {
	patchBackend,
	patchErrors,
	patchRelations,
	patchSchemaIndex,
	replaceInventorySection,
	replaceManagedBlock,
} from "./patch";
import { createSnapshot, createTableSql, migrationFolderName } from "./sql";
import * as tpl from "./templates";

export type GenerateKind = "model" | "resource";

export type GenerateSpec = {
	kind: GenerateKind;
	names: ResourceNames;
	fields: FieldSpec[];
	now: Date;
	force: boolean;
	writeAgents: boolean;
};

function readOptional(cwd: string, relative: string): string | null {
	const path = join(cwd, relative);
	if (!existsSync(path)) return null;
	return readFileSync(path, "utf8");
}

function requireText(cwd: string, relative: string, code: string, message: string): string {
	const text = readOptional(cwd, relative);
	if (text === null) {
		throw new CliError(code, message, { path: relative });
	}
	return text;
}

function nextMigrationFolder(cwd: string, names: ResourceNames, now: Date): string {
	const migrationsDir = join(cwd, "db/migrations");
	let date = new Date(now.getTime());
	for (let i = 0; i < 60; i++) {
		const folder = migrationFolderName(names.pluralKebab, date);
		if (!existsSync(join(migrationsDir, folder))) return folder;
		date = new Date(date.getTime() + 1000);
	}
	return migrationFolderName(names.pluralKebab, date);
}

function existingCreateMigration(cwd: string, names: ResourceNames): string | null {
	const migrationsDir = join(cwd, "db/migrations");
	if (!existsSync(migrationsDir)) return null;
	const suffix = `_create_${names.pluralKebab.replace(/-/g, "_")}`;
	for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
		if (entry.isDirectory() && entry.name.endsWith(suffix)) {
			return `db/migrations/${entry.name}/migration.sql`;
		}
	}
	return null;
}

function previousSnapshotId(cwd: string): string | undefined {
	const migrationsDir = join(cwd, "db/migrations");
	if (!existsSync(migrationsDir)) return undefined;
	const dirs = readdirSync(migrationsDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();
	for (let i = dirs.length - 1; i >= 0; i--) {
		const snap = join(migrationsDir, dirs[i]!, "snapshot.json");
		if (!existsSync(snap)) continue;
		try {
			const parsed = JSON.parse(readFileSync(snap, "utf8")) as { id?: string };
			if (typeof parsed.id === "string") return parsed.id;
		} catch {
			// ignore unreadable snapshots
		}
	}
	return undefined;
}

export function planGenerate(cwd: string, spec: GenerateSpec) {
	if (!existsSync(join(cwd, "server/app.ts")) || !existsSync(join(cwd, "db/schema"))) {
		throw new CliError(
			"typeway.generate.not_an_app",
			"Run generate from a Typeway app (server/app.ts + db/schema/).",
			{ path: "server/app.ts" },
		);
	}

	const names = spec.names;
	const fields = spec.fields;
	const items: PlannedFile[] = [];

	items.push({
		relative: `db/schema/${names.pluralKebab}.ts`,
		contents: tpl.schemaFile(names, fields),
		kind: "file",
	});
	items.push({
		relative: `app/schemas/${names.singularKebab}.ts`,
		contents: tpl.typeboxFile(names, fields),
		kind: "file",
	});
	items.push({
		relative: `app/models/${names.singularKebab}.ts`,
		contents: tpl.modelFile(names),
		kind: "file",
	});
	items.push({
		relative: `app/models/${names.singularKebab}.test.ts`,
		contents: tpl.modelTestFile(names, fields),
		kind: "file",
	});
	items.push({
		relative: `db/factories/${names.singularKebab}.ts`,
		contents: tpl.factoryFile(names, fields),
		kind: "file",
	});
	items.push({
		relative: `docs/${names.pluralKebab}.md`,
		contents: tpl.docsPage(names, fields, spec.kind),
		kind: "file",
	});

	const indexSource = requireText(
		cwd,
		"db/schema/index.ts",
		"typeway.generate.not_an_app",
		"db/schema/index.ts is missing.",
	);
	items.push({
		relative: "db/schema/index.ts",
		contents: patchSchemaIndex(indexSource, names.pluralKebab),
		kind: "patch",
	});

	const relationsSource = requireText(
		cwd,
		"db/schema/relations.ts",
		"typeway.generate.not_an_app",
		"db/schema/relations.ts is missing.",
	);
	items.push({
		relative: "db/schema/relations.ts",
		contents: patchRelations(relationsSource, names.pluralCamel),
		kind: "patch",
	});

	const existingMigration = existingCreateMigration(cwd, names);
	if (!existingMigration) {
		const folder = nextMigrationFolder(cwd, names, spec.now);
		items.push({
			relative: `db/migrations/${folder}/migration.sql`,
			contents: createTableSql(names, fields),
			kind: "file",
		});
		items.push({
			relative: `db/migrations/${folder}/snapshot.json`,
			contents: `${JSON.stringify(createSnapshot(names, fields, { prevId: previousSnapshotId(cwd) }), null, 2)}\n`,
			kind: "file",
		});
	}

	if (spec.kind === "resource") {
		items.push({
			relative: `server/routes/${names.pluralKebab}.ts`,
			contents: tpl.routeFile(names),
			kind: "file",
		});
		items.push({
			relative: `server/routes/${names.pluralKebab}.test.ts`,
			contents: tpl.routeTestFile(names, fields),
			kind: "file",
		});
		items.push({
			relative: `src/routes/${names.pluralKebab}/index.tsx`,
			contents: tpl.indexPage(names, fields),
			kind: "file",
		});
		items.push({
			relative: `src/routes/${names.pluralKebab}/$id.tsx`,
			contents: tpl.showPage(names, fields),
			kind: "file",
		});
		items.push({
			relative: `src/routes/${names.pluralKebab}/new.tsx`,
			contents: tpl.newPage(names, fields),
			kind: "file",
		});
		items.push({
			relative: `src/routes/${names.pluralKebab}/$id.edit.tsx`,
			contents: tpl.editPage(names, fields),
			kind: "file",
		});

		const appSource = requireText(
			cwd,
			"server/app.ts",
			"typeway.generate.not_an_app",
			"server/app.ts is missing.",
		);
		items.push({
			relative: "server/app.ts",
			contents: patchBackend(appSource, names.plugin, `./routes/${names.pluralKebab}`),
			kind: "patch",
		});

		const errorsSource = requireText(
			cwd,
			"app/errors.ts",
			"typeway.generate.not_an_app",
			"app/errors.ts is missing.",
		);
		items.push({
			relative: "app/errors.ts",
			contents: patchErrors(
				errorsSource,
				names.notFoundClass,
				names.errorCode,
				names.singularPascal,
			),
			kind: "patch",
		});
	}

	let manifest = readManifest(cwd) ?? emptyManifest();
	manifest = upsertModel(manifest, names, fields);
	if (spec.kind === "resource") {
		manifest = upsertResource(manifest, names);
	}

	items.push({
		relative: MANIFEST_PATH,
		contents: serializeManifest(manifest),
		kind: "patch",
	});

	const agentsSource = readOptional(cwd, "AGENTS.md") ?? "";
	const agents = replaceManagedBlock(
		agentsSource,
		managedAgentsBlock(manifest),
		spec.writeAgents || agentsSource.length === 0,
	);
	items.push({
		relative: "AGENTS.md",
		contents: agents.contents,
		kind: "patch",
	});

	const llmsSource = readOptional(cwd, "llms.txt") ?? "";
	items.push({
		relative: "llms.txt",
		contents: replaceInventorySection(llmsSource, llmsInventory(manifest)),
		kind: "patch",
	});

	return {
		...planFileList(cwd, items, spec.force),
		manifest,
		testFiles: testFilesFor(spec.kind, names),
	};
}

export function testFilesFor(kind: GenerateKind, names: ResourceNames): string[] {
	const files = [`app/models/${names.singularKebab}.test.ts`];
	if (kind === "resource") {
		files.push(`server/routes/${names.pluralKebab}.test.ts`);
	}
	return files;
}

export type { GenerateManifest };
