import assert from "node:assert";
import { describe, it } from "node:test";
import ts6 from "@suseejs/ts6";
import { suseeCompiler } from "../../../src/compiler/suseeCompiler.js";

describe("SuseeCompilers", () => {
	it("compiles TypeScript to CommonJS", () => {
		const result = suseeCompiler({
			sourceCode: "export const sum = (a: number, b: number) => a + b;",
			fileName: "susee.ts",
			compilerOptions: { module: ts6.ModuleKind.CommonJS, outDir: "dist" },
		});

		assert.match(result.code, /"use strict"/);
		assert.match(result.code, /exports\.sum/);
		assert.strictEqual(result.dts, undefined);
		assert.strictEqual(result.map, undefined);
		assert.strictEqual(result.file_name, "susee");
		assert.strictEqual(result.out_dir, "dist");
	});

	it("compiles TypeScript to ESM", () => {
		const result = suseeCompiler({
			sourceCode: "export const sum = (a: number, b: number) => a + b;",
			fileName: "susee.ts",
			compilerOptions: { module: ts6.ModuleKind.ES2020 },
		});

		assert.doesNotMatch(result.code, /exports\./);
		assert.match(result.code, /export const sum/);
		assert.strictEqual(result.dts, undefined);
		assert.strictEqual(result.map, undefined);
	});

	it("emits declaration and source map when enabled", () => {
		const result = suseeCompiler({
			sourceCode: "export const value = 1;",
			fileName: "src/index.ts",
			compilerOptions: {
				module: ts6.ModuleKind.CommonJS,
				declaration: true,
				sourceMap: true,
			},
		});

		assert.ok(result.dts);
		assert.ok(result.map);
		assert.match(result.dts as string, /export declare const value = 1/);
		assert.match(result.map as string, /"version":\s*3/);
		assert.strictEqual(result.file_name, "index");
	});

	it("supports JSX when react import exists", () => {
		const result = suseeCompiler({
			sourceCode:
				'import React from "react";\nexport const App = () => <section>Hello</section>;',
			fileName: "app.tsx",
			compilerOptions: { module: ts6.ModuleKind.ES2020 },
			isJsx: true,
		});

		assert.match(result.code, /react\/jsx-runtime/);
		assert.match(result.code, /_jsx\("section"/);
	});

	it("supports JSX with jsxImportSource when runtime import matches", () => {
		const result = suseeCompiler({
			sourceCode:
				'import { h } from "preact";\nexport const App = () => <section>Hello</section>;',
			fileName: "app.tsx",
			compilerOptions: {
				module: ts6.ModuleKind.ES2020,
				jsxImportSource: "preact",
			},
			isJsx: true,
		});

		assert.match(result.code, /preact\/jsx-runtime/);
		assert.match(result.code, /_jsx\("section"/);
	});

	it("exits when JSX is enabled without react import and jsxImportSource", () => {
		const sourceCode =
			'import { h } from "preact";\nexport const App = () => <div />;';
		let exitCode: number | undefined;
		let loggedError = "";
		const originalExit = process.exit;
		const originalError = console.error;

		try {
			process.exit = ((code?: number): never => {
				exitCode = code;
				throw new Error("process.exit called");
			}) as typeof process.exit;
			console.error = ((message?: unknown) => {
				loggedError = String(message);
			}) as typeof console.error;

			assert.throws(
				() =>
					suseeCompiler({
						sourceCode,
						fileName: "app.tsx",
						compilerOptions: { module: ts6.ModuleKind.ES2020 },
						isJsx: true,
					}),
				/process\.exit called/,
			);
			assert.strictEqual(exitCode, 1);
			assert.match(loggedError, /\[jsx-runtime-error\]/);
		} finally {
			process.exit = originalExit;
			console.error = originalError;
		}
	});

	it("exits when jsxImportSource does not match runtime import", () => {
		const sourceCode =
			'import { h } from "preact";\nexport const App = () => <div />;';
		let exitCode: number | undefined;
		let loggedError = "";
		const originalExit = process.exit;
		const originalError = console.error;

		try {
			process.exit = ((code?: number): never => {
				exitCode = code;
				throw new Error("process.exit called");
			}) as typeof process.exit;
			console.error = ((message?: unknown) => {
				loggedError = String(message);
			}) as typeof console.error;

			assert.throws(
				() =>
					suseeCompiler({
						sourceCode,
						fileName: "app.tsx",
						compilerOptions: {
							module: ts6.ModuleKind.ES2020,
							jsxImportSource: "solid-js",
						},
						isJsx: true,
					}),
				/process\.exit called/,
			);
			assert.strictEqual(exitCode, 1);
			assert.match(loggedError, /\[jsx-runtime-mismatch-error\]/);
		} finally {
			process.exit = originalExit;
			console.error = originalError;
		}
	});
});
