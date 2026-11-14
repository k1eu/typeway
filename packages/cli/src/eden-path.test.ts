import { describe, expect, test } from "bun:test";
import { treaty } from "@elysia/eden";
import { Elysia, t } from "elysia";

/**
 * Locks conventions.md open question 1: Treaty property access for a
 * `new Elysia({ prefix: "/api" })` backend. Generators must emit this
 * chain (`api.api.hello.get()`), not `api.hello.get()`.
 */
describe("Eden treaty path for a prefixed backend", () => {
	test("treaty(backend) nests under .api for prefix /api", async () => {
		const backend = new Elysia({ prefix: "/api" }).get(
			"/hello",
			{
				query: t.Object({
					name: t.Optional(t.String()),
				}),
			},
			({ query }) => ({ message: `Hello ${query.name ?? "world"}` }),
		);

		const api = treaty(backend);
		const { data, error } = await api.api.hello.get();
		expect(error).toBeNull();
		expect(data).toEqual({ message: "Hello world" });
	});

	test("nested resource prefix is api.api.articles.get()", async () => {
		const backend = new Elysia({ prefix: "/api" }).use(
			new Elysia({ prefix: "/articles" }).get("/", () => [{ id: 1, title: "Hi" }]),
		);
		const api = treaty(backend);
		const { data, error } = await api.api.articles.get();
		expect(error).toBeNull();
		expect(data).toEqual([{ id: 1, title: "Hi" }]);
	});
});
