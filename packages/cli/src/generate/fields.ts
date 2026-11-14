import { CliError } from "../errors";
import { camelCase, kebabCase, snakeCase } from "./names";

export type FieldKind = "string" | "text" | "integer" | "boolean" | "timestamp" | "real";

export type FieldSpec = {
	rawName: string;
	camel: string;
	snake: string;
	kind: FieldKind;
	drizzle: string;
	sqlType: string;
	typebox: string;
	factoryValue: string;
	formDefault: string;
};

const KIND_ALIASES: Record<string, FieldKind> = {
	string: "string",
	str: "string",
	text: "text",
	integer: "integer",
	int: "integer",
	boolean: "boolean",
	bool: "boolean",
	timestamp: "timestamp",
	datetime: "timestamp",
	date: "timestamp",
	real: "real",
	float: "real",
	number: "real",
};

const RESERVED = new Set([
	"id",
	"createdat",
	"updatedat",
	"created_at",
	"updated_at",
]);

const DEFAULT_FIELDS = ["title:string", "body:text"];

export function parseFields(args: string[]): FieldSpec[] {
	const raw = args.length > 0 ? args : DEFAULT_FIELDS;
	const seen = new Set<string>();
	const fields: FieldSpec[] = [];
	for (const token of raw) {
		fields.push(parseField(token, seen));
	}
	return fields;
}

export function parseField(token: string, seen: Set<string>): FieldSpec {
	const split = token.indexOf(":");
	if (split <= 0 || split === token.length - 1) {
		throw new CliError(
			"typeway.generate.invalid_field",
			`Invalid field "${token}". Use name:type (e.g. title:string body:text).`,
		);
	}
	const rawName = token.slice(0, split);
	const rawType = token.slice(split + 1).toLowerCase();
	const kebab = kebabCase(rawName);
	const camel = camelCase(kebab);
	if (!camel || !/^[a-z][a-zA-Z0-9]*$/.test(camel)) {
		throw new CliError(
			"typeway.generate.invalid_field",
			`Invalid field name "${rawName}". Use camelCase or kebab-case.`,
		);
	}
	if (RESERVED.has(camel.toLowerCase()) || RESERVED.has(rawName.toLowerCase())) {
		throw new CliError(
			"typeway.generate.invalid_field",
			`Field "${rawName}" is reserved (id, createdAt, updatedAt are added automatically).`,
		);
	}
	if (seen.has(camel)) {
		throw new CliError(
			"typeway.generate.invalid_field",
			`Duplicate field "${camel}".`,
		);
	}
	seen.add(camel);

	const kind = KIND_ALIASES[rawType];
	if (!kind) {
		throw new CliError(
			"typeway.generate.unknown_type",
			`Unknown field type "${rawType}" on "${rawName}". Use string, text, integer, boolean, timestamp, or real.`,
		);
	}

	return {
		rawName,
		camel,
		snake: snakeCase(kebab),
		kind,
		drizzle: drizzleColumn(camel, snakeCase(kebab), kind),
		sqlType: sqlType(kind),
		typebox: typeboxFor(kind),
		factoryValue: factoryValue(camel, kind),
		formDefault: formDefault(kind),
	};
}

function drizzleColumn(camel: string, snake: string, kind: FieldKind): string {
	switch (kind) {
		case "string":
		case "text":
			return `${camel}: text("${snake}").notNull()`;
		case "integer":
			return `${camel}: integer("${snake}").notNull()`;
		case "boolean":
			return `${camel}: integer("${snake}", { mode: "boolean" }).notNull()`;
		case "timestamp":
			return `${camel}: integer("${snake}", { mode: "timestamp_ms" }).notNull()`;
		case "real":
			return `${camel}: real("${snake}").notNull()`;
	}
}

function sqlType(kind: FieldKind): string {
	switch (kind) {
		case "string":
		case "text":
			return "text";
		case "real":
			return "real";
		case "integer":
		case "boolean":
		case "timestamp":
			return "integer";
	}
}

function typeboxFor(kind: FieldKind): string {
	switch (kind) {
		case "string":
			return "t.String({ minLength: 1, maxLength: 200 })";
		case "text":
			return "t.String({ minLength: 1 })";
		case "integer":
			return "t.Number()";
		case "boolean":
			return "t.Boolean()";
		case "timestamp":
			return "t.Date()";
		case "real":
			return "t.Number()";
	}
}

function factoryValue(camel: string, kind: FieldKind): string {
	switch (kind) {
		case "string":
			return camel === "title" ? '"Untitled"' : `"${camel}"`;
		case "text":
			return '"lorem ipsum"';
		case "integer":
		case "real":
			return "0";
		case "boolean":
			return "false";
		case "timestamp":
			return "new Date()";
	}
}

function formDefault(kind: FieldKind): string {
	switch (kind) {
		case "string":
		case "text":
			return '""';
		case "integer":
		case "real":
			return "0";
		case "boolean":
			return "false";
		case "timestamp":
			return "new Date().toISOString()";
	}
}

export function drizzleImports(fields: FieldSpec[]): string[] {
	const imports = new Set<string>(["integer", "sqliteTable"]);
	for (const field of fields) {
		if (field.kind === "string" || field.kind === "text") imports.add("text");
		if (field.kind === "real") imports.add("real");
	}
	return [...imports];
}
