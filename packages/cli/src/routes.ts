import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertNoDryRun, assertNoForce } from "./argv";
import { CliError } from "./errors";
import type { IO } from "./io";
import { printJson } from "./json";

export type RouteSchemaMap = {
	query?: unknown;
	params?: unknown;
	body?: unknown;
	headers?: unknown;
	response?: unknown;
};

export type IntrospectedRoute = {
	method: string;
	path: string;
	file: string | null;
	auth: boolean;
	schemas: RouteSchemaMap | null;
};

type ElysiaRouteLike = {
	method?: unknown;
	path?: unknown;
	hooks?: Record<string, unknown> | null;
};

const SCHEMA_KEYS = ["query", "params", "body", "headers", "response"] as const;

function asString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function jsonClone(value: unknown): unknown {
	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return undefined;
	}
}

export function schemasFromHooks(
	hooks: Record<string, unknown> | null | undefined,
): RouteSchemaMap | null {
	if (!hooks) return null;
	const schemas: RouteSchemaMap = {};
	let present = false;
	for (const key of SCHEMA_KEYS) {
		if (hooks[key] == null) continue;
		const cloned = jsonClone(hooks[key]);
		if (cloned === undefined) continue;
		schemas[key] = cloned;
		present = true;
	}
	return present ? schemas : null;
}

export function introspectRoutes(backend: { routes?: readonly unknown[] }): IntrospectedRoute[] {
	const routes = Array.isArray(backend.routes) ? backend.routes : [];
	const out: IntrospectedRoute[] = [];
	for (const raw of routes) {
		const route = raw as ElysiaRouteLike;
		const method = asString(route.method)?.toUpperCase();
		const path = asString(route.path);
		if (!method || !path) continue;
		out.push({
			method,
			path,
			file: null,
			auth: false,
			schemas: schemasFromHooks(route.hooks),
		});
	}
	out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
	return out;
}

function formatTable(routes: IntrospectedRoute[]): string {
	const headers = ["METHOD", "PATH", "FILE"];
	const rows = routes.map((r) => [r.method, r.path, r.file ?? "—"]);
	const widths = headers.map((h, i) =>
		Math.max(h.length, ...rows.map((row) => row[i]!.length)),
	);
	const line = (cols: string[]) =>
		cols.map((c, i) => c.padEnd(widths[i]!)).join("  ");
	return [line(headers), ...rows.map(line)].join("\n") + (rows.length ? "\n" : "");
}

export async function runRoutes(
	io: IO,
	opts: { json: boolean; dryRun: boolean; force: boolean },
): Promise<number> {
	assertNoDryRun("routes", opts.dryRun);
	assertNoForce("routes", opts.force);

	const entry = join(io.cwd, "server/app.ts");
	if (!existsSync(entry)) {
		throw new CliError(
			"typeway.routes.unreadable",
			"Cannot import server/app.ts — run this from a Typeway app.",
			{ path: "server/app.ts" },
		);
	}

	let mod: { backend?: { routes?: readonly unknown[] } };
	try {
		mod = (await import(pathToFileURL(entry).href)) as typeof mod;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CliError(
			"typeway.routes.unreadable",
			`Failed to import server/app.ts: ${message}`,
			{ path: "server/app.ts" },
		);
	}

	if (!mod.backend || typeof mod.backend !== "object") {
		throw new CliError(
			"typeway.routes.unreadable",
			"server/app.ts must export `backend`.",
			{ path: "server/app.ts" },
		);
	}

	const routes = introspectRoutes(mod.backend);
	if (opts.json) {
		printJson(io, { ok: true, routes });
	} else {
		io.stdout.write(formatTable(routes));
	}
	return 0;
}
