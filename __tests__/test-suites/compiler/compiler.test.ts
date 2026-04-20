import assert from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { Compiler } from "../../../src/lib/compiler.js";
import { fileExists, readJson, setupTempDir } from "../test_helpers.js";

const execFileAsync = promisify(execFile);

describe("Compiler", () => {
	it("compile emits esm and commonjs outputs", async () => {
		const tempDir = await setupTempDir("compiler-outputs");
		const entryDir = path.join(tempDir, "src");
		const entryFile = path.join(entryDir, "index.ts");
		const outDir = path.join(tempDir, "dist");

		await fs.mkdir(entryDir, { recursive: true });
		await fs.writeFile(entryFile, "export const answer = 42;\n", "utf8");

		const compiler = new Compiler({
			buildEntryPoints: [
				{
					entry: entryFile,
					exportPath: ".",
					format: ["esm", "commonjs"],
					tsconfigFilePath: undefined,
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

		assert.strictEqual(await fileExists(path.join(outDir, "index.mjs")), true);
		assert.strictEqual(await fileExists(path.join(outDir, "index.cjs")), true);
		assert.strictEqual(
			await fileExists(path.join(outDir, "index.d.mts")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(outDir, "index.d.cts")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(outDir, "index.mjs.map")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(outDir, "index.cjs.map")),
			true,
		);

		const esmCode = await fs.readFile(path.join(outDir, "index.mjs"), "utf8");
		const cjsCode = await fs.readFile(path.join(outDir, "index.cjs"), "utf8");

		assert.match(esmCode, /42/);
		assert.match(cjsCode, /42/);
		assert.match(esmCode, /index\.mjs\.map/);
		assert.match(cjsCode, /index\.cjs\.map/);
	});

	it("compile applies sync and async post-process plugins", async () => {
		const tempDir = await setupTempDir("compiler-plugins");
		const entryDir = path.join(tempDir, "src");
		const entryFile = path.join(entryDir, "index.ts");
		const outDir = path.join(tempDir, "dist");

		await fs.mkdir(entryDir, { recursive: true });
		await fs.writeFile(
			entryFile,
			'export const message = "ORIGINAL_VALUE";\n',
			"utf8",
		);

		const compiler = new Compiler({
			buildEntryPoints: [
				{
					entry: entryFile,
					exportPath: ".",
					format: ["esm"],
					tsconfigFilePath: undefined,
					rename: true,
					plugins: [
						{
							type: "post-process",
							async: false,
							func(code: string) {
								return code.replace("ORIGINAL_VALUE", "SYNC_VALUE");
							},
						},
						{
							type: "post-process",
							async: true,
							async func(code: string) {
								return `${code}\nexport const asyncValue = "ASYNC_VALUE";`;
							},
						},
					],
					warning: false,
					outputDirectoryPath: outDir,
				},
			],
			updatePackage: false,
			outDir,
		});

		await compiler.compile();

		const esmCode = await fs.readFile(path.join(outDir, "index.mjs"), "utf8");
		assert.match(esmCode, /SYNC_VALUE/);
		assert.match(esmCode, /ASYNC_VALUE/);
	});

	it("compile updates package.json when updatePackage is enabled", async () => {
		const tempDir = await setupTempDir("compiler-package-json");
		const entryDir = path.join(tempDir, "src");
		const entryFile = path.join(entryDir, "index.ts");
		const packageJsonPath = path.join(tempDir, "package.json");
		const scriptPath = path.join(tempDir, "compile.ts");
		const compilerModulePath = path
			.resolve(process.cwd(), "src/lib/compiler.ts")
			.replaceAll("\\", "/");

		await fs.mkdir(entryDir, { recursive: true });
		await fs.writeFile(entryFile, "export const value = 1;\n", "utf8");
		await fs.writeFile(
			packageJsonPath,
			JSON.stringify({ name: "tmp", type: "module" }, null, 2),
			"utf8",
		);
		await fs.writeFile(
			scriptPath,
			`import path from "node:path";
import { Compiler } from "${compilerModulePath}";

const cwd = process.cwd();
const outDir = path.join(cwd, "dist");

const compiler = new Compiler({
  buildEntryPoints: [
    {
      entry: path.join(cwd, "src/index.ts"),
      exportPath: ".",
      format: ["esm", "commonjs"],
      tsconfigFilePath: undefined,
      rename: true,
      plugins: [],
      warning: false,
      outputDirectoryPath: outDir,
    },
  ],
  updatePackage: true,
  outDir,
});

await compiler.compile();
`,
			"utf8",
		);

		await execFileAsync("npx", ["tsx", scriptPath], {
			cwd: tempDir,
		});

		const pkg = await readJson(packageJsonPath);
		assert.strictEqual(pkg.name, "tmp");
		assert.strictEqual(pkg.type, "module");
		assert.strictEqual(pkg.main, "dist/index.cjs");
		assert.strictEqual(pkg.module, "dist/index.mjs");
		assert.deepStrictEqual(pkg.exports, {});
	});

	it("compile emits subpath outputs for exportPath ./foo", async () => {
		const tempDir = await setupTempDir("compiler-subpath");
		const entryDir = path.join(tempDir, "src");
		const entryFile = path.join(entryDir, "foo.ts");
		const outDir = path.join(tempDir, "dist");
		const subpathOutDir = path.join(outDir, "foo");

		await fs.mkdir(entryDir, { recursive: true });
		await fs.writeFile(entryFile, "export const foo = 1;\n", "utf8");

		const compiler = new Compiler({
			buildEntryPoints: [
				{
					entry: entryFile,
					exportPath: "./foo",
					format: ["esm", "commonjs"],
					tsconfigFilePath: undefined,
					rename: true,
					plugins: [],
					warning: false,
					outputDirectoryPath: subpathOutDir,
				},
			],
			updatePackage: false,
			outDir,
		});

		await compiler.compile();

		assert.strictEqual(
			await fileExists(path.join(subpathOutDir, "foo.mjs")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(subpathOutDir, "foo.cjs")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(subpathOutDir, "foo.d.mts")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(subpathOutDir, "foo.d.cts")),
			true,
		);
	});
});
