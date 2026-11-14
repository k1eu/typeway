import { describe, expect, test } from "bun:test";
import { parseFields } from "./fields";

describe("parseFields", () => {
	test("defaults to title:string body:text", () => {
		const fields = parseFields([]);
		expect(fields.map((f) => `${f.camel}:${f.kind}`)).toEqual([
			"title:string",
			"body:text",
		]);
	});

	test("maps aliases", () => {
		const fields = parseFields(["views:int", "published:bool", "score:float"]);
		expect(fields.map((f) => f.kind)).toEqual(["integer", "boolean", "real"]);
	});

	test("rejects reserved and unknown types", () => {
		expect(() => parseFields(["id:string"])).toThrow(/reserved/);
		expect(() => parseFields(["title:uuid"])).toThrow(/Unknown field type/);
		expect(() => parseFields(["title"])).toThrow(/Invalid field/);
	});
});
