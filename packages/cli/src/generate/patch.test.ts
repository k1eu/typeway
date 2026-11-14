import { describe, expect, test } from "bun:test";
import { patchBackend, patchRelations, patchSchemaIndex } from "./patch";

describe("patchSchemaIndex", () => {
	test("replaces export {} and is convergent", () => {
		const first = patchSchemaIndex("export {}\n", "posts");
		expect(first).toContain('export * from "./posts"');
		expect(first).not.toContain("export {}");
		expect(patchSchemaIndex(first, "posts")).toBe(first);
	});
});

describe("patchRelations", () => {
	test("inserts a key into the empty callback", () => {
		const source = `export const relations = defineRelations(schema, () => ({
  // comment
}))
`;
		const first = patchRelations(source, "posts");
		expect(first).toContain("posts: {},");
		expect(patchRelations(first, "posts")).toBe(first);
	});

	test("rewrites a one-line empty object", () => {
		const source = `export const relations = defineRelations(schema, () => ({}))
`;
		expect(patchRelations(source, "posts")).toContain("posts: {},");
	});
});

describe("patchBackend", () => {
	test("chains .use and is convergent", () => {
		const source = `import { Elysia, t, HTTPError } from "elysia"

export const backend = new Elysia({ prefix: "/api" }).get(
  "/hello",
  {},
  () => ({ message: "Hello world" }),
)

export type Backend = typeof backend
`;
		const first = patchBackend(source, "postsApi", "./routes/posts");
		expect(first).toContain('import { postsApi } from "./routes/posts"');
		expect(first).toContain(".use(postsApi)");
		expect(patchBackend(first, "postsApi", "./routes/posts")).toBe(first);
	});
});
