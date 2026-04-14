import assert from "node:assert";
import { describe, it } from "node:test";
import type ts from "typescript";
import { bundle } from "../../../src/lib/bundle/index.js";

function makeDepFile(file: string, content: string) {
	return {
		file,
		content,
		length: content.length,
		size: {
			logical: content.length,
			allocated: null,
			utf8: content.length,
			buffBytes: content.length,
		},
		includeDefExport: false,
		moduleType: "esm",
		fileExt: ".ts",
		isJsx: false,
	};
}

describe("Bundle Index Tests", () => {
	it("bundles files, filters local imports, and keeps entry exports", async () => {
		const point = {
			fileName: "/virtual/index.ts",
			exportPath: ".",
			format: "esm",
			rename: true,
			outDir: "dist",
			tsOptions: {
				cjs: {} as ts.CompilerOptions,
				esm: {} as ts.CompilerOptions,
				default: {} as ts.CompilerOptions,
			},
			depFiles: [
				makeDepFile(
					"/virtual/lib.ts",
					'import fs from "node:fs";\nexport const x = 1;\n',
				),
				makeDepFile(
					"/virtual/index.ts",
					'import { x } from "./lib.js";\nimport path from "node:path";\nexport const y = x + Number(Boolean(fs)) + Number(Boolean(path));\n',
				),
			],
			plugins: [],
		};

		const result = await bundle({
			points: [point] as never[],
			allowUpdatePackageJson: true,
		});

		assert.strictEqual(result.allowUpdatePackageJson, true);
		assert.strictEqual(result.points.length, 1);

		const output = result.points[0]?.bundledContent ?? "";
		assert.match(output, /import fs from "node:fs";/);
		assert.match(output, /import path from "node:path";/);
		assert.doesNotMatch(output, /from "\.\/lib\.js"/);
		assert.doesNotMatch(output, /export const x = 1;/);
		assert.match(output, /const x = 1;/);
		assert.match(
			output,
			/export const y = x \+ Number\(Boolean\(fs\)\) \+ Number\(Boolean\(path\)\);/,
		);
	});

	it("applies pre-process plugins in order", async () => {
		const preOne = {
			type: "pre-process",
			async: false,
			func: (code: string) => `${code}\n//pre-one`,
		};
		const preTwo = {
			type: "pre-process",
			async: true,
			func: async (code: string) => `${code}\n//pre-two`,
		};
		const dependencyPluginIgnored = {
			type: "dependency",
			async: false,
			func: (depFiles: unknown) => depFiles,
		};

		const point = {
			fileName: "/virtual/index.ts",
			exportPath: ".",
			format: "esm",
			rename: true,
			outDir: "dist",
			tsOptions: {
				cjs: {} as ts.CompilerOptions,
				esm: {} as ts.CompilerOptions,
				default: {} as ts.CompilerOptions,
			},
			depFiles: [makeDepFile("/virtual/index.ts", "export const value = 1;\n")],
			plugins: [preOne, dependencyPluginIgnored, preTwo] as never[],
		};

		const result = await bundle({
			points: [point] as never[],
			allowUpdatePackageJson: false,
		});

		const output = result.points[0]?.bundledContent ?? "";
		assert.match(output, /export const value = 1;/);
		assert.match(output, /\/\/pre-one/);
		assert.match(output, /\/\/pre-two/);
		assert.ok(output.indexOf("//pre-one") < output.indexOf("//pre-two"));
	});

	it("renames recursive calls for default-exported declarations", async () => {
		const point = {
			fileName: "/virtual/index.ts",
			exportPath: ".",
			format: "esm",
			rename: true,
			outDir: "dist",
			tsOptions: {
				cjs: {} as ts.CompilerOptions,
				esm: {} as ts.CompilerOptions,
				default: {} as ts.CompilerOptions,
			},
			depFiles: [
				makeDepFile(
					"/virtual/require.ts",
					"export default function handleRequire(n: number): number {\n\tif (n <= 0) return 0;\n\treturn handleRequire(n - 1) + 1;\n}\n",
				),
				makeDepFile(
					"/virtual/index.ts",
					'import handleRequire from "./require.js";\nexport const value = handleRequire(2);\n',
				),
			],
			plugins: [],
		};

		const result = await bundle({
			points: [point] as never[],
			allowUpdatePackageJson: false,
		});

		const output = result.points[0]?.bundledContent ?? "";
		assert.match(
			output,
			/function __exportDefault__handleRequire(?:_\d+)?\(n: number\)/,
		);
		assert.match(
			output,
			/return __exportDefault__handleRequire(?:_\d+)?\(n - 1\) \+ 1;/,
		);
		assert.doesNotMatch(output, /return handleRequire\(n - 1\) \+ 1;/);
		assert.match(
			output,
			/export const value = __exportDefault__handleRequire(?:_\d+)?\(2\);/,
		);
	});
});
