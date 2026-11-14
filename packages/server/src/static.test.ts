import { describe, expect, it } from "bun:test";
import { staticRoutesFor } from "./static";

describe("staticRoutesFor", () => {
	it("serves a hashed asset at its file path", () => {
		expect(staticRoutesFor("assets/app-abc.js")).toEqual([
			"/assets/app-abc.js",
		]);
	});

	it("registers prerendered index.html at the clean URL and trailing slash", () => {
		expect(staticRoutesFor("rendering/ssg/index.html")).toEqual([
			"/rendering/ssg/index.html",
			"/rendering/ssg",
			"/rendering/ssg/",
		]);
	});

	it("registers a root index.html as /", () => {
		expect(staticRoutesFor("index.html")).toEqual(["/index.html", "/"]);
	});
});
