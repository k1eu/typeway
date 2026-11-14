import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { introspectRoutes, schemasFromHooks } from "./routes";

describe("Elysia 2 RC route table", () => {
	test("prefix is stored on the full path; method is uppercase", () => {
		const backend = new Elysia({ prefix: "/api" }).get(
			"/hello",
			{
				query: t.Object({
					name: t.Optional(t.String()),
				}),
			},
			({ query }) => ({ message: `Hello ${query.name ?? "world"}` }),
		);

		expect(Array.isArray(backend.routes)).toBe(true);
		const hello = backend.routes.find(
			(r) => r.method === "GET" && r.path === "/api/hello",
		);
		expect(hello).toBeDefined();
		expect(hello).toHaveProperty("hooks");
	});

	test("introspectRoutes emits stable JSON fields", () => {
		const backend = new Elysia({ prefix: "/api" })
			.get(
				"/hello",
				{
					query: t.Object({
						name: t.Optional(t.String()),
					}),
					response: t.Object({ message: t.String() }),
				},
				({ query }) => ({ message: `Hello ${query.name ?? "world"}` }),
			)
			.post(
				"/articles",
				{ body: t.Object({ title: t.String() }) },
				({ body }) => body,
			);

		const routes = introspectRoutes(backend);
		expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
			"POST /api/articles",
			"GET /api/hello",
		]);
		expect(routes.every((r) => r.auth === false)).toBe(true);
		const hello = routes.find((r) => r.path === "/api/hello")!;
		expect(hello.file).toBe("server/app.ts");
		const articles = routes.find((r) => r.path === "/api/articles")!;
		expect(articles.file).toBeNull();

		expect(hello.schemas?.query).toMatchObject({
			type: "object",
			properties: { name: { type: "string" } },
		});
		expect(hello.schemas?.response).toMatchObject({
			"200": { type: "object" },
		});
	});

	test("schemasFromHooks ignores missing keys and drops functions", () => {
		expect(schemasFromHooks(undefined)).toBeNull();
		expect(schemasFromHooks({ parse: () => undefined })).toBeNull();
		expect(schemasFromHooks({ body: { type: "string" } })).toEqual({
			body: { type: "string" },
		});
	});
});
