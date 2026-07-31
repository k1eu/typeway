import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { connect } from "./index";

describe("connect middleware", () => {
	it("sets a header from middleware (falls through to 404)", async () => {
		const HEADER_NAME = "elysia-middlewares";
		const EXPECTED_VALUE = "connect";

		const app = new Elysia().use(
			connect((req, res, next) => {
				res.setHeader(HEADER_NAME, EXPECTED_VALUE);
				next();
			}),
		);

		const response = await app.handle(new Request("http://localhost/"));

		expect(response.status).toBe(404);
		expect(response.headers.get(HEADER_NAME)).toBe(EXPECTED_VALUE);
	});

	it("parses query params and responds from middleware", async () => {
		const EXPECTED_VALUE = "KRAVETSONE";

		const app = new Elysia().use(
			connect((req, res) => {
				res.end(req.query.value);
			}),
		);

		const response = await app.handle(
			new Request(`http://localhost/?value=${EXPECTED_VALUE}`),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe(EXPECTED_VALUE);
	});

	it("parses a JSON body", async () => {
		const EXPECTED_VALUE = "KRAVETSONE";

		const app = new Elysia().use(
			connect((req, res) => {
				res.end(JSON.stringify(req.body));
			}),
		);

		const response = await app.handle(
			new Request("http://localhost/", {
				method: "POST",
				body: JSON.stringify({ value: EXPECTED_VALUE }),
				headers: { "Content-Type": "application/json" },
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ value: EXPECTED_VALUE });
	});

	it("handles a request with no body", async () => {
		const app = new Elysia().use(
			connect((req, res) => {
				res.end(JSON.stringify(req.body));
			}),
		);

		const response = await app.handle(
			new Request("http://localhost/", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			}),
		);

		expect(response.status).toBe(200);
	});
});
