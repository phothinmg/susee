import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import ts from "typescript";
import bundle from "../../src/lib/bundle/index.js";
import type {
	InitializedPoint,
	InitializedResult,
} from "../../src/lib/initialization/index.js";
import { createDepFile } from "./helpers.js";

describe("bundle", () => {
	it("bundles points and runs bundle handlers + pre-process plugins", async () => {
		const depFilePath = path.join(process.cwd(), "src", "dep.ts");
		const entryFilePath = path.join(process.cwd(), "src", "index.ts");
		const depContent = [
			'import dup from "external-a";',
			"export default function () {",
			"\treturn dup;",
			"}",
			"export const unusedDep = 42;",
		].join("\n");
		const entryContent = [
			'import dup from "external-b";',
			'import anon from "./dep.ts";',
			'const fs = require("node:fs");',
			"const output = anon();",
			"console.log(output, fs.existsSync ? 1 : 0, dup);",
		].join("\n");

		const point: InitializedPoint = {
			fileName: "src/index.ts",
			exportPath: ".",
			format: "both",
			rename: true,
			outDir: "dist",
			tsOptions: {
				cjs: { module: ts.ModuleKind.CommonJS },
				esm: { module: ts.ModuleKind.ES2020 },
				default: {
					module: ts.ModuleKind.ES2020,
					target: ts.ScriptTarget.ES2022,
				},
			},
			depFiles: [
				createDepFile(depFilePath, depContent),
				createDepFile(entryFilePath, entryContent),
			],
			plugins: [
				{
					type: "pre-process",
					async: false,
					func(content) {
						return `/* pre-sync */\n${content}`;
					},
				},
				{
					type: "pre-process",
					async: true,
					async func(content) {
						return `${content}\n/* pre-async */`;
					},
				},
			],
		};
		const input: InitializedResult = {
			points: [point],
			allowUpdatePackageJson: false,
		};

		const result = await bundle(input);
		assert.strictEqual(result.allowUpdatePackageJson, false);
		assert.strictEqual(result.points.length, 1);

		const bundled = result.points[0]?.sourceCode;
		assert.ok(bundled);
		assert.match(bundled, /\/\* pre-sync \*\//);
		assert.match(bundled, /\/\* pre-async \*\//);
		assert.match(bundled, /__anonymous__/);
		//assert.match(bundled, /_dupName_/);
		assert.match(bundled, /import fs from "node:fs";/);
		assert.match(bundled, /\/\/src\/dep.ts/);
		assert.match(bundled, /\/\/src\/index.ts/);
		assert.doesNotMatch(bundled, /import anon from "\.\/dep.ts"/);
		assert.doesNotMatch(bundled, /unusedDep/);
	});

	it("bundles every point and keeps result ordering", async () => {
		const makePoint = (suffix: string): InitializedPoint => ({
			fileName: `src/${suffix}.ts`,
			exportPath: `./${suffix}`,
			format: "esm",
			rename: false,
			outDir: "dist",
			tsOptions: {
				cjs: { module: ts.ModuleKind.CommonJS },
				esm: { module: ts.ModuleKind.ES2020 },
				default: {
					module: ts.ModuleKind.ES2020,
					target: ts.ScriptTarget.ES2022,
				},
			},
			depFiles: [
				createDepFile(
					path.join(process.cwd(), "src", `${suffix}.ts`),
					"export const value = 1;\nconsole.log(value);",
				),
			],
			plugins: [],
		});

		const input: InitializedResult = {
			points: [makePoint("a"), makePoint("b")],
			allowUpdatePackageJson: true,
		};
		const result = await bundle(input);

		assert.strictEqual(result.allowUpdatePackageJson, true);
		assert.deepStrictEqual(
			result.points.map((i) => i.entryFileName),
			["src/a.ts", "src/b.ts"],
		);
	});

	it("preserves type-only imports when they are used in type positions", async () => {
		const filePath = path.join(process.cwd(), "src", "type-only.ts");
		const content = [
			'import type { Foo } from "foo";',
			"const value: Foo = { bar: 1 };",
			"console.log(value.bar);",
		].join("\n");

		const point: InitializedPoint = {
			fileName: "src/type-only.ts",
			exportPath: "./type-only",
			format: "esm",
			rename: false,
			outDir: "dist",
			tsOptions: {
				cjs: { module: ts.ModuleKind.CommonJS },
				esm: { module: ts.ModuleKind.ES2020 },
				default: {
					module: ts.ModuleKind.ES2020,
					target: ts.ScriptTarget.ES2022,
				},
			},
			depFiles: [createDepFile(filePath, content)],
			plugins: [],
		};

		const result = await bundle({
			points: [point],
			allowUpdatePackageJson: false,
		});
		const bundled = result.points[0]?.sourceCode;
		assert.ok(bundled);
		assert.match(bundled, /import type \{ Foo \} from "foo";/);
		assert.doesNotMatch(bundled, /import \{ Foo \} from "foo";/);
	});

	it("removes unused default, named, and type import specifiers", async () => {
		const filePath = path.join(process.cwd(), "src", "mixed-imports.ts");
		const content = [
			'import DefaultThing, { Used, Unused, type TypeUsed, type TypeUnused } from "pkg";',
			"const value: TypeUsed = Used;",
			"console.log(value);",
		].join("\n");

		const point: InitializedPoint = {
			fileName: "src/mixed-imports.ts",
			exportPath: "./mixed-imports",
			format: "esm",
			rename: false,
			outDir: "dist",
			tsOptions: {
				cjs: { module: ts.ModuleKind.CommonJS },
				esm: { module: ts.ModuleKind.ES2020 },
				default: {
					module: ts.ModuleKind.ES2020,
					target: ts.ScriptTarget.ES2022,
				},
			},
			depFiles: [createDepFile(filePath, content)],
			plugins: [],
		};

		const result = await bundle({
			points: [point],
			allowUpdatePackageJson: false,
		});
		const bundled = result.points[0]?.sourceCode;
		assert.ok(bundled);
		assert.doesNotMatch(bundled, /DefaultThing/);
		assert.doesNotMatch(bundled, /\bUnused\b/);
		assert.doesNotMatch(bundled, /\bTypeUnused\b/);
		assert.match(bundled, /import \{ Used, type TypeUsed \} from "pkg";/);
	});
});
