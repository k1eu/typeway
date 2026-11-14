import { DEFAULT_DIST_DIR } from "./defaults";
import type { HostApp, ServeFn, TypewayOptions } from "./types";

export function resolvePort(port?: number): number {
	return port ?? Number(process.env.PORT ?? 3000);
}

export function resolveDistDir(distDir?: string): string {
	return distDir ?? DEFAULT_DIST_DIR;
}

function defaultServe(
	app: HostApp,
	port: number,
	onListen?: (info: { port: number }) => void,
) {
	return app.listen(port, () => onListen?.({ port }));
}

function defaultOnListen(
	info: { port: number },
	mode: "development" | "production",
) {
	console.log(`Server running on localhost:${info.port} (${mode})`);
}

export function maybeListen(
	app: HostApp,
	options: TypewayOptions,
	mode: "development" | "production",
) {
	if (options.serve === false) return;

	const port = resolvePort(options.port);
	const onListen = options.onListen ?? ((info) => defaultOnListen(info, mode));
	const serve: ServeFn =
		typeof options.serve === "function" ? options.serve : defaultServe;

	serve(app, port, onListen);
}
