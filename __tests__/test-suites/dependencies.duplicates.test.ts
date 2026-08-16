import assert from "node:assert";
import { describe, it } from "node:test";
import ts6 from "@suseejs/ts6";
import type { DependenciesTree, DepsFile } from "@suseejs/type";
import { checkDuplicates } from "../../node_src/dependencies/duplicates.js";

function createDepFile(file: string, content: string): DepsFile {
	return {
		file,
		content,
		bytes: Buffer.byteLength(content),
		moduleType: "esm",
		fileExt: ".ts",
		is_jsx: false,
		is_entry: false,
	};
}

function createTree(depFiles: DepsFile[]): DependenciesTree {
	return {
		entry: "src/index.ts",
		npm: [],
		nodes: [],
		warns: [],
		depFiles,
	};
}

describe("checkDuplicates", () => {
	it("ignores duplicate names declared in different nested scopes", () => {
		const tree = createTree([
			createDepFile(
				"src/a.ts",
				[
					"namespace One {",
					"  export const value = 1;",
					"}",
					"export function alpha() {",
					"  const local = 1;",
					"  return local;",
					"}",
				].join("\n"),
			),
			createDepFile(
				"src/b.ts",
				[
					"namespace Two {",
					"  export const value = 2;",
					"}",
					"export function beta() {",
					"  const local = 2;",
					"  return local;",
					"}",
				].join("\n"),
			),
		]);

		assert.doesNotThrow(() =>
			checkDuplicates(tree, (file, content) =>
				ts6.createSourceFile(file, content, ts6.ScriptTarget.Latest, true),
			),
		);
	});

	it("still reports duplicates declared at the same top level", () => {
		const tree = createTree([
			createDepFile("src/a.ts", "export const shared = 1;"),
			createDepFile("src/b.ts", "export const shared = 2;"),
		]);
		let exitCode: number | undefined;
		const originalExit = process.exit;
		const originalWarn = console.warn;
		const originalInfo = console.info;

		try {
			process.exit = ((code?: number): never => {
				exitCode = code;
				throw new Error("process.exit called");
			}) as typeof process.exit;
			console.warn = (() => {}) as typeof console.warn;
			console.info = (() => {}) as typeof console.info;

			assert.throws(
				() =>
					checkDuplicates(tree, (file, content) =>
						ts6.createSourceFile(file, content, ts6.ScriptTarget.Latest, true),
					),
				/process\.exit called/,
			);
			assert.strictEqual(exitCode, 1);
		} finally {
			process.exit = originalExit;
			console.warn = originalWarn;
			console.info = originalInfo;
		}
	});
});
