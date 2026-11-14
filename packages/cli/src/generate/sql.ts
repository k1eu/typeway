import { randomUUID } from "node:crypto";
import type { FieldSpec } from "./fields";
import type { ResourceNames } from "./names";

export function migrationStamp(date: Date): string {
	const y = date.getUTCFullYear().toString().padStart(4, "0");
	const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
	const d = date.getUTCDate().toString().padStart(2, "0");
	const hh = date.getUTCHours().toString().padStart(2, "0");
	const mm = date.getUTCMinutes().toString().padStart(2, "0");
	const ss = date.getUTCSeconds().toString().padStart(2, "0");
	return `${y}${m}${d}${hh}${mm}${ss}`;
}

export function migrationFolderName(pluralKebab: string, date: Date): string {
	return `${migrationStamp(date)}_create_${pluralKebab.replace(/-/g, "_")}`;
}

export function createTableSql(names: ResourceNames, fields: FieldSpec[]): string {
	const cols = [
		"\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL",
		...fields.map((f) => `\t\`${f.snake}\` ${f.sqlType} NOT NULL`),
		"\t`created_at` integer NOT NULL",
		"\t`updated_at` integer NOT NULL",
	];
	return `CREATE TABLE \`${names.table}\` (\n${cols.join(",\n")}\n);\n`;
}

type SnapshotColumn = {
	table: string;
	name: string;
	type: string;
	notNull: boolean;
	autoincrement: boolean;
	default: null;
	generated: null;
	entityType: "columns";
};

export function createSnapshot(
	names: ResourceNames,
	fields: FieldSpec[],
	options: { id?: string; prevId?: string } = {},
) {
	const id = options.id ?? randomUUID();
	const prevId = options.prevId ?? "00000000-0000-0000-0000-000000000000";
	const columns: SnapshotColumn[] = [
		{
			table: names.table,
			name: "id",
			type: "integer",
			notNull: false,
			autoincrement: true,
			default: null,
			generated: null,
			entityType: "columns",
		},
		...fields.map((f) => ({
			table: names.table,
			name: f.snake,
			type: f.sqlType,
			notNull: true,
			autoincrement: false,
			default: null,
			generated: null,
			entityType: "columns" as const,
		})),
		{
			table: names.table,
			name: "created_at",
			type: "integer",
			notNull: true,
			autoincrement: false,
			default: null,
			generated: null,
			entityType: "columns",
		},
		{
			table: names.table,
			name: "updated_at",
			type: "integer",
			notNull: true,
			autoincrement: false,
			default: null,
			generated: null,
			entityType: "columns",
		},
	];
	return {
		dialect: "sqlite",
		id,
		prevIds: [prevId],
		version: "7",
		ddl: [
			{ name: names.table, entityType: "tables" },
			...columns,
			{
				table: names.table,
				name: `${names.table}_pk`,
				columns: ["id"],
				nameExplicit: false,
				entityType: "pks",
			},
		],
		renames: [],
	};
}
