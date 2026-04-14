import { describe, it } from "node:test";
import resolveExtension from "../../src/lib/dependencies/lib/resolveExt.js";

//=
describe("Resolve extensions", () => {
	it("should resolve file path without extension", (t) => {
		const filePath = "./tests/dependencies/esm/foo";
		const resolve = resolveExtension(filePath);
		const result = resolve.result;
		const expected = "./tests/dependencies/esm/foo.js";
		t.assert.deepEqual(result, expected);
	});
	it("should replace file path extension if it is different from resolved extension", (t) => {
		const filePath = "./tests/dependencies/ts/foo.js";
		const resolve = resolveExtension(filePath);
		const result = resolve.result;
		const expected = "./tests/dependencies/ts/foo.ts";
		t.assert.deepEqual(result, expected);
	});
});
