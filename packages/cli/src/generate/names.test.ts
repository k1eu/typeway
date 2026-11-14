import { describe, expect, test } from "bun:test";
import { parseResourceName } from "./names";

describe("parseResourceName", () => {
	test("PascalCase Post", () => {
		const names = parseResourceName("Post");
		expect(names).toMatchObject({
			singularKebab: "post",
			pluralKebab: "posts",
			singularPascal: "Post",
			pluralCamel: "posts",
			plugin: "postsApi",
			table: "posts",
			errorCode: "post.not_found",
			notFoundClass: "PostNotFound",
			factory: "postFactory",
		});
	});

	test("kebab invoice-item", () => {
		const names = parseResourceName("invoice-item");
		expect(names).toMatchObject({
			singularKebab: "invoice-item",
			pluralKebab: "invoice-items",
			singularPascal: "InvoiceItem",
			pluralCamel: "invoiceItems",
			plugin: "invoiceItemsApi",
			table: "invoice_items",
			errorCode: "invoice_item.not_found",
			factory: "invoiceItemFactory",
		});
	});

	test("--plural override", () => {
		const names = parseResourceName("person", "people");
		expect(names.pluralKebab).toBe("people");
		expect(names.table).toBe("people");
		expect(names.plugin).toBe("peopleApi");
	});

	test("rejects empty and invalid names", () => {
		expect(() => parseResourceName("")).toThrow(/Usage/);
		expect(() => parseResourceName("123bad")).toThrow(/Invalid name/);
	});
});
