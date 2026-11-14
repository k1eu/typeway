import { CliError } from "../errors";

export function insertImport(source: string, line: string): string {
	if (source.includes(line)) return source;
	const lines = source.split("\n");
	let lastImport = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i]!.startsWith("import ")) lastImport = i;
	}
	if (lastImport === -1) {
		return `${line}\n${source}`;
	}
	lines.splice(lastImport + 1, 0, line);
	return lines.join("\n");
}

export function patchSchemaIndex(source: string, pluralKebab: string): string {
	const stmt = `export * from "./${pluralKebab}"`;
	if (source.includes(stmt)) return source;
	if (/^export \{\}\s*$/m.test(source)) {
		return source.replace(/^export \{\}\s*$/m, stmt);
	}
	return `${source.trimEnd()}\n${stmt}\n`;
}

export function patchRelations(source: string, tableConst: string): string {
	const keyRe = new RegExp(`(?:^|\\n)\\s*${tableConst}\\s*:`);
	if (keyRe.test(source)) return source;

	const empty = /defineRelations\(\s*schema\s*,\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>\s*\(\{\s*\}\s*\)/;
	if (empty.test(source)) {
		return source.replace(
			/defineRelations\(\s*schema\s*,\s*((?:\([^)]*\)|[A-Za-z_$][\w$]*)?)\s*=>\s*\(\{\s*\}\s*\)/,
			(_m, cb: string) =>
				`defineRelations(schema, ${cb} => ({\n  ${tableConst}: {},\n})`,
		);
	}

	const open = /defineRelations\(\s*schema\s*,\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>\s*\(\{/;
	if (!open.test(source)) {
		throw new CliError(
			"typeway.generate.patch_failed",
			"Could not find defineRelations(schema, … => ({ … })) in db/schema/relations.ts.",
			{ path: "db/schema/relations.ts" },
		);
	}
	return source.replace(open, (m) => `${m}\n  ${tableConst}: {},`);
}

export function patchBackend(
	source: string,
	plugin: string,
	importPath: string,
): string {
	let next = insertImport(source, `import { ${plugin} } from "${importPath}"`);
	if (next.includes(`.use(${plugin})`)) return next;
	if (!/\nexport type Backend/.test(next)) {
		throw new CliError(
			"typeway.generate.patch_failed",
			"server/app.ts must export `type Backend` so generators can chain `.use()`.",
			{ path: "server/app.ts" },
		);
	}
	return next.replace(
		/\nexport type Backend/,
		`\n  .use(${plugin})\n\nexport type Backend`,
	);
}

export function patchErrors(
	source: string,
	notFoundClass: string,
	errorCode: string,
	singularPascal: string,
): string {
	if (source.includes(`class ${notFoundClass}`)) return source;
	const block = `
export class ${notFoundClass} extends HTTPError.id(
  "${errorCode}",
  404,
) {
  constructor(id: number) {
    super(\`${singularPascal} \${id} was not found\`)
  }
}
`;
	return `${source.trimEnd()}\n${block}`;
}

const START = "<!-- typeway:conventions:start -->";
const END = "<!-- typeway:conventions:end -->";

export function replaceManagedBlock(
	source: string,
	block: string,
	writeAgents: boolean,
): { contents: string; inserted: boolean } {
	const start = source.indexOf(START);
	const end = source.indexOf(END);
	if (start !== -1 && end !== -1 && end > start) {
		const before = source.slice(0, start);
		const after = source.slice(end + END.length);
		return { contents: `${before}${block}${after}`, inserted: false };
	}
	if (!writeAgents) {
		throw new CliError(
			"typeway.generate.markers_missing",
			"AGENTS.md is missing the managed block markers. Pass --write-agents to append one.",
			{ path: "AGENTS.md" },
		);
	}
	const trimmed = source.trimEnd();
	const sep = trimmed.length > 0 ? "\n\n" : "";
	return { contents: `${trimmed}${sep}${block}\n`, inserted: true };
}

const INV_START = "<!-- typeway:inventory:start -->";
const INV_END = "<!-- typeway:inventory:end -->";

export function replaceInventorySection(source: string, inventory: string): string {
	const start = source.indexOf(INV_START);
	const end = source.indexOf(INV_END);
	const section = `${INV_START}\n${inventory}${INV_END}`;
	if (start !== -1 && end !== -1 && end > start) {
		return `${source.slice(0, start)}${section}${source.slice(end + INV_END.length)}`;
	}
	const trimmed = source.trimEnd();
	return `${trimmed}\n\n${section}\n`;
}
