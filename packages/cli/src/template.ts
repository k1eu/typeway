import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export type WriteAction = "create" | "update" | "skip";

export type PlannedWrite = {
	action: WriteAction;
	path: string;
	reason?: string;
};

export type TemplateVars = Record<string, string>;

const TEMPLATES_ROOT = join(import.meta.dir, "..", "templates", "app");

export function templatesRoot() {
	return TEMPLATES_ROOT;
}

function posixPath(path: string) {
	return path.split(sep).join("/");
}

function applyVars(source: string, vars: TemplateVars) {
	return source.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
		return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : match;
	});
}

export function listTemplateFiles(root = TEMPLATES_ROOT): string[] {
	const out: string[] = [];
	function walk(dir: string) {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else out.push(full);
		}
	}
	walk(root);
	out.sort();
	return out;
}

/** Strip a trailing `.tmpl` so tests in the template tree are not picked up by bun test. */
export function destName(templatePath: string, root = TEMPLATES_ROOT): string {
	const rel = relative(root, templatePath);
	return posixPath(rel.endsWith(".tmpl") ? rel.slice(0, -".tmpl".length) : rel);
}

export function planWrites(
	destDir: string,
	vars: TemplateVars,
	options: { force: boolean; extra?: { path: string; contents: string }[] } = {
		force: false,
	},
): { writes: PlannedWrite[]; files: { relative: string; contents: string }[] } {
	const writes: PlannedWrite[] = [];
	const files: { relative: string; contents: string }[] = [];
	const seen = new Set<string>();

	for (const templatePath of listTemplateFiles()) {
		const relativePath = destName(templatePath);
		const raw = readFileSync(templatePath, "utf8");
		const contents = applyVars(raw, vars);
		seen.add(relativePath);
		files.push({ relative: relativePath, contents });
		const dest = join(destDir, relativePath);
		let exists = false;
		try {
			exists = statSync(dest).isFile();
		} catch {
			exists = false;
		}
		if (exists && !options.force) {
			writes.push({
				action: "skip",
				path: relativePath,
				reason: "exists",
			});
		} else {
			writes.push({
				action: exists ? "update" : "create",
				path: relativePath,
			});
		}
	}

	for (const extra of options.extra ?? []) {
		if (seen.has(extra.path)) continue;
		files.push({ relative: extra.path, contents: extra.contents });
		const dest = join(destDir, extra.path);
		let exists = false;
		try {
			exists = statSync(dest).isFile();
		} catch {
			exists = false;
		}
		if (exists && !options.force) {
			writes.push({ action: "skip", path: extra.path, reason: "exists" });
		} else {
			writes.push({ action: exists ? "update" : "create", path: extra.path });
		}
	}

	writes.sort((a, b) => a.path.localeCompare(b.path));
	files.sort((a, b) => a.relative.localeCompare(b.relative));
	return { writes, files };
}

export function applyWrites(
	destDir: string,
	files: { relative: string; contents: string }[],
	writes: PlannedWrite[],
) {
	const skip = new Set(
		writes.filter((w) => w.action === "skip").map((w) => w.path),
	);
	mkdirSync(destDir, { recursive: true });
	for (const file of files) {
		if (skip.has(file.relative)) continue;
		const dest = join(destDir, file.relative);
		mkdirSync(dirname(dest), { recursive: true });
		writeFileSync(dest, file.contents);
	}
}
