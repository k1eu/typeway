import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

/**
 * TanStack Start's SSR entry. Named `server.ts` by convention — the Vite plugin
 * resolves `src/server.{ts,tsx,...}` as the SSR build input, so this one file is
 * what runs in *both* modes: dev imports the source through Vite's SSR module
 * runner, prod runs its compiled output. See `@typeway/server`'s
 * `DEFAULT_SSR_ENTRY`.
 *
 * `/__entry` is load-bearing for the test suite, not decoration: it is the only
 * way to prove from outside that dev and prod run the same entry module. Before
 * the rename, dev loaded `src/tanstack-server.ts` while the build silently
 * compiled TanStack's packaged default entry instead — so anything added here
 * would have worked in dev and vanished in prod. `tests/features.test.ts`
 * asserts this route in both modes.
 *
 * It answers before delegating, and deliberately does not touch responses on the
 * way out: wrapping them to add a marker header would rebuild `Headers` (risking
 * the `Set-Cookie` arrays the cookie fixture asserts) and some TanStack
 * responses — redirects in particular — carry immutable headers.
 */
export default createServerEntry({
  fetch(request) {
    if (request.url.endsWith("/__entry")) {
      return new Response("src/server.ts", {
        headers: { "content-type": "text/plain" },
      });
    }

    return handler.fetch(request);
  },
});
