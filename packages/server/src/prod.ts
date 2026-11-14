import { maybeListen, resolveDistDir } from "./host";
import type { HostApp, TypewayOptions } from "./types";

export type ProdResult = { app: HostApp };

/**
 * Production host. Safe to import from a `bun build --target bun` boot file:
 * this module never imports `vite`.
 *
 * `typeway` from `@typeway/server/dev` is a different function — it is the
 * one that creates a Vite server. Do not re-export it from this file.
 */
export function typeway(options: TypewayOptions) {
	return {
		async prod(): Promise<ProdResult> {
			const distDir = resolveDistDir(options.distDir);
			await options.frontend.prod(options.app, distDir);
			maybeListen(options.app, options, "production");
			return { app: options.app };
		},
	};
}
