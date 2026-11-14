import { existsSync } from "node:fs";
import type { HostApp } from "./types";

/**
 * Paths a client-build file should be served at.
 *
 * Prerendered pages land as `<route>/index.html`, but they are requested as
 * `/rendering/ssg` (and `/rendering/ssg/`). Registering only the file path
 * would send those navigations through SSR — the opposite of prerendering.
 */
export function staticRoutesFor(file: string): string[] {
	const path = `/${file}`;
	const routes = [path];

	if (file.endsWith("index.html")) {
		const dir = path.slice(0, -"index.html".length); // keeps the trailing slash
		const clean = dir === "/" ? "/" : dir.slice(0, -1);
		routes.push(clean);
		if (clean !== "/") routes.push(dir);
	}

	return routes;
}

/**
 * Register every file in `clientDir` as a real Elysia route, once at boot.
 *
 * Cheaper and more honest than a per-request `exists()` wildcard: page
 * navigations never pay a filesystem miss, and a missing directory fails at
 * boot instead of looking fine while serving no JS or CSS.
 *
 * `.all` rather than `.get` so HEAD matches the old wildcard.
 */
export async function serveClientAssets(
	app: HostApp,
	clientDir: string,
): Promise<string[]> {
	if (!existsSync(clientDir)) {
		throw new Error(
			`Could not read ${clientDir} — run \`bun run build\` before \`bun run start\`.`,
		);
	}

	let files: string[];
	try {
		files = await Array.fromAsync(
			new Bun.Glob("**/*").scan({ cwd: clientDir, onlyFiles: true }),
		);
	} catch (error) {
		throw new Error(
			`Could not read ${clientDir} — run \`bun run build\` before \`bun run start\`.`,
			{ cause: error },
		);
	}

	const seen = new Set<string>();

	for (const file of files) {
		const source = `${clientDir}/${file}`;
		for (const route of staticRoutesFor(file)) {
			if (seen.has(route)) continue;
			seen.add(route);
			app.all(route, () => new Response(Bun.file(source)));
		}
	}

	return files;
}
