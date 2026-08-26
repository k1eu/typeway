import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

/**
 * TanStack Start's SSR entry. The filename is the convention `@typeway/vite`
 * and TanStack's Vite plugin both look for — see `DEFAULT_SSR_ENTRY`.
 */
export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
