import assert from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { fileExists, setupTempDir } from "../test_helpers.js";

const execFileAsync = promisify(execFile);
const compilerModulePath = path
	.resolve(process.cwd(), "src/lib/compiler.ts")
	.replaceAll("\\", "/");

async function createVueRuntimePackage(tempDir: string) {
	const vueDir = path.join(tempDir, "node_modules", "vue");
	await fs.mkdir(vueDir, { recursive: true });
	await fs.writeFile(
		path.join(vueDir, "package.json"),
		JSON.stringify(
			{
				name: "vue",
				type: "module",
				exports: {
					".": "./index.js",
					"./jsx-runtime": "./jsx-runtime.js",
				},
			},
			null,
			2,
		),
		"utf8",
	);
	await fs.writeFile(
		path.join(vueDir, "index.js"),
		"export function h(type, props, ...children) { return { type, props, children }; }\n",
		"utf8",
	);
	await fs.writeFile(
		path.join(vueDir, "jsx-runtime.js"),
		`export const Fragment = Symbol.for("vue.fragment");
export function jsx(type, props, key) {
	return { key, props, type };
}
export const jsxs = jsx;
`,
		"utf8",
	);
}

async function writeCompilerFixture(
	tempDir: string,
	entrySource: string,
	compilerOptions: Record<string, unknown>,
) {
	const entryDir = path.join(tempDir, "src");
	const entryFile = path.join(entryDir, "index.tsx");
	const outDir = path.join(tempDir, "dist");
	const scriptPath = path.join(tempDir, "compile.ts");
	const tsconfigFilePath = path.join(tempDir, "tsconfig.json");

	await fs.mkdir(entryDir, { recursive: true });
	await createVueRuntimePackage(tempDir);
	await fs.writeFile(
		path.join(tempDir, "package.json"),
		JSON.stringify({ name: "jsx-test-fixture", type: "module" }, null, 2),
		"utf8",
	);
	await fs.writeFile(entryFile, entrySource, "utf8");
	await fs.writeFile(
		tsconfigFilePath,
		JSON.stringify({ compilerOptions }, null, 2),
		"utf8",
	);
	await fs.writeFile(
		scriptPath,
		`import path from "node:path";
import { Compiler } from "${compilerModulePath}";

const cwd = process.cwd();
const outDir = path.join(cwd, "dist");

async function main() {
	const compiler = new Compiler({
		buildEntryPoints: [
			{
				entry: path.join(cwd, "src/index.tsx"),
				exportPath: ".",
				format: ["esm"],
				tsconfigFilePath: path.join(cwd, "tsconfig.json"),
				rename: true,
				plugins: [],
				warning: false,
				outputDirectoryPath: outDir,
			},
		],
		updatePackage: false,
		outDir,
	});

	await compiler.compile();
}

main();
`,
		"utf8",
	);

	return { outDir, scriptPath };
}

async function runCompilerScript(scriptPath: string, cwd: string) {
	return execFileAsync("npx", ["tsx", scriptPath], { cwd });
}

describe("JSX syntax", () => {
	it("compiles tsx when jsxImportSource matches the runtime import", async () => {
		const tempDir = await setupTempDir("jsx-compiler-success");
		const { outDir, scriptPath } = await writeCompilerFixture(
			tempDir,
			`declare namespace JSX {
	interface IntrinsicElements {
		box: { id?: string };
	}
}

import { h } from "vue";

export const factory = h;
export const view = <box id="demo">hello</box>;
`,
			{
				jsx: "react-jsx",
				jsxImportSource: "vue",
			},
		);

		await runCompilerScript(scriptPath, tempDir);

		const outputFile = path.join(outDir, "index.mjs");
		assert.strictEqual(await fileExists(outputFile), true);

		const esmCode = await fs.readFile(outputFile, "utf8");
		assert.match(esmCode, /vue\/jsx-runtime/);
		assert.doesNotMatch(esmCode, /<box id="demo">hello<\/box>/);

		const mod = await import(pathToFileURL(outputFile).href);
		assert.strictEqual(typeof mod.factory, "function");
		assert.deepStrictEqual(mod.view, {
			key: undefined,
			props: { children: "hello", id: "demo" },
			type: "box",
		});
	});

	it("fails when jsx syntax uses a non-react runtime without jsxImportSource", async () => {
		const tempDir = await setupTempDir("jsx-compiler-missing-import-source");
		const { scriptPath } = await writeCompilerFixture(
			tempDir,
			`declare namespace JSX {
	interface IntrinsicElements {
		box: { id?: string };
	}
}

import { h } from "vue";

export const factory = h;
export const view = <box id="demo">hello</box>;
`,
			{
				jsx: "react-jsx",
			},
		);

		await assert.rejects(
			() => runCompilerScript(scriptPath, tempDir),
			(error: NodeJS.ErrnoException & { stderr?: string }) => {
				assert.strictEqual(error.code, 1);
				assert.match(
					error.stderr ?? "",
					/\[jsx-runtime-error\]:[\s\S]*jsxImportSource in tsconfig\./,
				);
				return true;
			},
		);
	});

	it("fails when jsxImportSource does not match the runtime import", async () => {
		const tempDir = await setupTempDir("jsx-compiler-mismatch");
		const { scriptPath } = await writeCompilerFixture(
			tempDir,
			`declare namespace JSX {
	interface IntrinsicElements {
		box: { id?: string };
	}
}

import { h } from "vue";

export const factory = h;
export const view = <box id="demo">hello</box>;
`,
			{
				jsx: "react-jsx",
				jsxImportSource: "solid-js",
			},
		);

		await assert.rejects(
			() => runCompilerScript(scriptPath, tempDir),
			(error: NodeJS.ErrnoException & { stderr?: string }) => {
				assert.strictEqual(error.code, 1);
				assert.match(
					error.stderr ?? "",
					/\[jsx-runtime-mismatch-error\]:[\s\S]*jsxImportSource from tsconfig are mismatched/,
				);
				return true;
			},
		);
	});
});
