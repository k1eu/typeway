/**
 * `bench/` is deliberately NOT a workspace member — the root `package.json`
 * `workspaces` array is owned elsewhere and must not be edited here. Bun's
 * isolated linker means a bare `elysia` specifier cannot be resolved by
 * walking up from `bench/`, and installing a second copy under
 * `bench/node_modules` would produce a *different* module realpath — i.e. a
 * second Elysia instance, which breaks `instanceof Elysia` inside `.use()`.
 *
 * Importing through the workspace-resolved symlink gives us the exact same
 * realpath that `@typeway/connect` resolves, so there is a single Elysia
 * instance across the bench servers and the bridge under test.
 */
export { Elysia } from "../../packages/connect/node_modules/elysia/dist/index.mjs";
export type { Elysia as ElysiaType } from "../../packages/connect/node_modules/elysia/dist/index.mjs";
