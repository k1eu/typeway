import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FieldSpec } from "./fields";
import type { ResourceNames } from "./names";

export const MANIFEST_PATH = ".typeway/generate.json";

export type ManifestModel = {
	name: string;
	singular: string;
	plural: string;
	file: string;
	table: string;
	schema: string;
	factory: string;
	fields: { name: string; type: string }[];
};

export type ManifestResource = {
	name: string;
	plural: string;
	file: string;
	paths: {
		index: string;
		create: string;
		show: string;
		update: string;
		destroy: string;
	};
	pages: string[];
};

export type GenerateManifest = {
	version: 1;
	models: ManifestModel[];
	resources: ManifestResource[];
};

export function emptyManifest(): GenerateManifest {
	return { version: 1, models: [], resources: [] };
}

export function readManifest(cwd: string): GenerateManifest | null {
	const path = join(cwd, MANIFEST_PATH);
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<GenerateManifest>;
		return {
			version: 1,
			models: Array.isArray(parsed.models) ? parsed.models : [],
			resources: Array.isArray(parsed.resources) ? parsed.resources : [],
		};
	} catch {
		return emptyManifest();
	}
}

export function upsertModel(
	manifest: GenerateManifest,
	names: ResourceNames,
	fields: FieldSpec[],
): GenerateManifest {
	const entry: ManifestModel = {
		name: names.singularPascal,
		singular: names.singularKebab,
		plural: names.pluralKebab,
		file: `app/models/${names.singularKebab}.ts`,
		table: names.table,
		schema: `db/schema/${names.pluralKebab}.ts`,
		factory: `db/factories/${names.singularKebab}.ts`,
		fields: fields.map((f) => ({ name: f.camel, type: f.kind })),
	};
	const models = manifest.models.filter((m) => m.file !== entry.file);
	models.push(entry);
	models.sort((a, b) => a.name.localeCompare(b.name));
	return { ...manifest, models };
}

export function upsertResource(
	manifest: GenerateManifest,
	names: ResourceNames,
): GenerateManifest {
	const entry: ManifestResource = {
		name: names.singularPascal,
		plural: names.pluralKebab,
		file: `server/routes/${names.pluralKebab}.ts`,
		paths: {
			index: `GET /api/${names.pluralKebab}`,
			create: `POST /api/${names.pluralKebab}`,
			show: `GET /api/${names.pluralKebab}/:id`,
			update: `PATCH /api/${names.pluralKebab}/:id`,
			destroy: `DELETE /api/${names.pluralKebab}/:id`,
		},
		pages: [
			`src/routes/${names.pluralKebab}/index.tsx`,
			`src/routes/${names.pluralKebab}/$id.tsx`,
			`src/routes/${names.pluralKebab}/new.tsx`,
			`src/routes/${names.pluralKebab}/$id.edit.tsx`,
		],
	};
	const resources = manifest.resources.filter((r) => r.file !== entry.file);
	resources.push(entry);
	resources.sort((a, b) => a.name.localeCompare(b.name));
	return { ...manifest, resources };
}

export function fileForRoute(
	path: string,
	manifest: { resources: { plural: string; file: string }[] } | null,
): string | null {
	if (path === "/api/hello") return "server/app.ts";
	if (!manifest) return null;
	for (const resource of manifest.resources) {
		const prefix = `/api/${resource.plural}`;
		if (
			path === prefix ||
			path === `${prefix}/` ||
			path.startsWith(`${prefix}/`)
		) {
			return resource.file;
		}
	}
	return null;
}

export function serializeManifest(manifest: GenerateManifest): string {
	return `${JSON.stringify(manifest, null, 2)}\n`;
}
