import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import ts from "typescript";
import bundle from "../../src/lib/bundle/index.js";
import type {
	InitializePoint,
	InitializeResult,
} from "../../src/lib/initialization/index.js";
import type { DependenciesFile } from "../../src/lib/types.js";

function createDepFile(file: string, content: string): DependenciesFile {
	return {
		file,
		content,
		length: content.length,
		includeDefExport: /export\s+default|export\s*=/.test(content),
		size: {
			logical: Buffer.byteLength(content, "utf8"),
			allocated: null,
			utf8: Buffer.byteLength(content, "utf8"),
			buffBytes: Buffer.byteLength(content, "utf8"),
		},
		moduleType: "esm",
		fileExt: path.extname(file) as ".ts",
		isJsx: false,
	};
}

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

		const point: InitializePoint = {
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
		const input: InitializeResult = {
			points: [point],
			allowUpdatePackageJson: false,
		};

		const result = await bundle(input);
		assert.strictEqual(result.allowUpdatePackageJson, false);
		assert.strictEqual(result.points.length, 1);

		const bundled = result.points[0]?.bundledContent;
		assert.ok(bundled);
		assert.match(bundled, /\/\* pre-sync \*\//);
		assert.match(bundled, /\/\* pre-async \*\//);
		assert.match(bundled, /__anonymous__/);
		assert.match(bundled, /__dup__/);
		assert.match(bundled, /import fs from "node:fs";/);
		assert.match(bundled, /\/\/src\/dep.ts/);
		assert.match(bundled, /\/\/src\/index.ts/);
		assert.doesNotMatch(bundled, /import anon from "\.\/dep.ts"/);
		assert.doesNotMatch(bundled, /unusedDep/);
	});

	it("bundles every point and keeps result ordering", async () => {
		const makePoint = (suffix: string): InitializePoint => ({
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

		const input: InitializeResult = {
			points: [makePoint("a"), makePoint("b")],
			allowUpdatePackageJson: true,
		};
		const result = await bundle(input);

		assert.strictEqual(result.allowUpdatePackageJson, true);
		assert.deepStrictEqual(
			result.points.map((i) => i.fileName),
			["src/a.ts", "src/b.ts"],
		);
		for (const point of result.points) {
			assert.ok(point.bundledContent.length > 0);
		}
	});
});
