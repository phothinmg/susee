import assert from "node:assert";
import { describe, it } from "node:test";
import type ts from "typescript";
import { duplicateHandlers } from "../../src/lib/bundle/duplicate.js";

describe("Duplicate Handler Tests", () => {
	it("renames duplicate identifiers in non-call expressions", async () => {
		const deps = [
			{
				file: "/virtual/a.ts",
				content: "export const foo = 1;\nexport const value = foo;\n",
			},
			{
				file: "/virtual/b.ts",
				content:
					"export const foo = 2;\nexport const obj = { foo };\nexport const arr = [foo];\n",
			},
		] as Parameters<typeof duplicateHandlers.renamed>[0];

		const result = await duplicateHandlers.renamed(
			deps,
			{} as ts.CompilerOptions,
		);
		const output = result.map((entry) => entry.content).join("\n");

		assert.match(output, /export const __duplicatesNames__foo_\d+ = 1;/);
		assert.match(output, /export const value = __duplicatesNames__foo_\d+;/);
		assert.match(output, /export const __duplicatesNames__foo_\d+ = 2;/);
		assert.match(
			output,
			/export const obj = \{\s*foo: __duplicatesNames__foo_\d+\s*\};/,
		);
		assert.match(output, /export const arr = \[__duplicatesNames__foo_\d+\];/);
	});

	it("resets duplicate rename state between runs", async () => {
		const deps = [
			{
				file: "/virtual/a.ts",
				content: "export const foo = 1;\nexport const value = foo;\n",
			},
			{
				file: "/virtual/b.ts",
				content: "export const foo = 2;\nexport const value = foo;\n",
			},
		] as Parameters<typeof duplicateHandlers.renamed>[0];

		const first = await duplicateHandlers.renamed(
			deps,
			{} as ts.CompilerOptions,
		);
		const second = await duplicateHandlers.renamed(
			deps,
			{} as ts.CompilerOptions,
		);

		assert.deepStrictEqual(
			second.map((entry) => entry.content),
			first.map((entry) => entry.content),
		);
	});
});
