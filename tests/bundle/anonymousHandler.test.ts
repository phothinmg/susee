import assert from "node:assert";
import { describe, it } from "node:test";
import ts from "typescript";
import { anonymousHandler } from "../../src/lib/bundle/anonymous.js";

describe("Anonymous Handler Tests", () => {
	it("renames anonymous default export and updates importer usages", async () => {
		const deps = [
			{
				file: "/virtual/foo.ts",
				content: "export default function () { return 1; }\n",
			},
			{
				file: "/virtual/main.ts",
				content:
					"import foo from './foo.js';\nconst value = foo();\nexport { foo, value };\n",
			},
		] as Parameters<typeof anonymousHandler>[0];

		const result = await anonymousHandler(deps, {} as ts.CompilerOptions);
		const output = result.map((entry) => entry.content).join("\n");

		assert.match(output, /export default function __anonymous__foo_\d+\(\)/);
		assert.match(output, /import __anonymous__foo_\d+ from '\.\/foo\.js';/);
		assert.match(output, /const value = __anonymous__foo_\d+\(\);/);
		assert.match(output, /export \{ __anonymous__foo_\d+, value \};/);
	});

	it("rewrites imported anonymous default usage in property access", async () => {
		const deps = [
			{
				file: "/virtual/data.ts",
				content: "export default { a: 1 };\n",
			},
			{
				file: "/virtual/main.ts",
				content:
					"import data from './data.js';\nconst value = data.a;\nexport { value };\n",
			},
		] as Parameters<typeof anonymousHandler>[0];

		const result = await anonymousHandler(deps, {} as ts.CompilerOptions);
		const output = result.map((entry) => entry.content).join("\n");

		assert.match(output, /const __anonymous__data_\d+ = \{ a: 1 \};/);
		assert.match(output, /import __anonymous__data_\d+ from '\.\/data\.js';/);
		assert.match(output, /const value = __anonymous__data_\d+\.a;/);
	});

	it("resets anonymous rename state between runs", async () => {
		const deps = [
			{
				file: "/virtual/foo.ts",
				content: "export default function () { return 1; }\n",
			},
			{
				file: "/virtual/main.ts",
				content:
					"import foo from './foo.js';\nconst value = foo();\nexport { foo, value };\n",
			},
		] as Parameters<typeof anonymousHandler>[0];

		const first = await anonymousHandler(deps, {} as ts.CompilerOptions);
		const second = await anonymousHandler(deps, {} as ts.CompilerOptions);

		assert.deepStrictEqual(
			second.map((entry) => entry.content),
			first.map((entry) => entry.content),
		);
	});
});
