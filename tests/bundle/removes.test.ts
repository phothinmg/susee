import assert from "node:assert";
import { describe, it } from "node:test";
import type ts from "typescript";
import { removeHandlers } from "../../src/lib/bundle/removes.js";

describe("Remove Handler Tests", () => {
	it("keeps qualified type names for type-only import-equals and emits namespace type import", async () => {
		const removedStatements: string[] = [];
		const [removeImports] = await removeHandlers(
			removedStatements,
			{} as ts.CompilerOptions,
		);

		const result = removeImports({
			file: "/virtual/types.ts",
			content:
				'import type Foo = require("foo");\ntype User = Foo.Bar;\nexport { User };\n',
			length: 0,
			size: {
				logical: 0,
				allocated: null,
				utf8: 0,
				buffBytes: 0,
			},
			includeDefExport: false,
			moduleType: "cjs",
			fileExt: ".js",
			isJsx: false,
		});

		assert.match(result.content, /type User = Foo\.Bar;/);
		assert.match(
			removedStatements.join("\n"),
			/import type \* as Foo from "foo";/,
		);
	});

	it("converts non-type import-equals to default import", async () => {
		const removedStatements: string[] = [];
		const [removeImports] = await removeHandlers(
			removedStatements,
			{} as ts.CompilerOptions,
		);

		const result = removeImports({
			file: "/virtual/types.ts",
			content: 'import Foo = require("foo");\ntype User = Foo.Bar;\n',
			length: 0,
			size: {
				logical: 0,
				allocated: null,
				utf8: 0,
				buffBytes: 0,
			},
			includeDefExport: false,
			moduleType: "cjs",
			fileExt: ".js",
			isJsx: false,
		});

		assert.match(result.content, /type User = Foo\.Bar;/);
		assert.match(removedStatements.join("\n"), /import Foo from "foo";/);
	});
});
