import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { after, before, describe, it } from "node:test";
import type { files as filesNamespace } from "../../src/packages/files.js";

let files: typeof filesNamespace;
let tempDir: string;
let originalCwd: string;

function seedPackageJson(content?: Record<string, unknown>): void {
	const base = {
		name: "tmp-files",
		version: "1.0.0",
		description: "tmp",
		private: true,
	};
	fs.writeFileSync(
		path.join(tempDir, "package.json"),
		JSON.stringify({ ...base, ...content }, null, 2),
		"utf8",
	);
}

describe("files namespace", () => {
	before(async () => {
		originalCwd = process.cwd();
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "suseejs-files-"));
		seedPackageJson();
		process.chdir(tempDir);
		({ files } = await import("../../src/packages/files.js"));
	});

	after(() => {
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("resolves and normalizes helper paths", () => {
		assert.strictEqual(
			files.resolvePath("src/index.ts"),
			path.join(tempDir, "src/index.ts"),
		);
		assert.strictEqual(
			files.relativePath(path.join(tempDir, "src/index.ts")),
			"src/index.ts",
		);
		assert.strictEqual(files.joinPath("a", "b", "c"), path.join("a", "b", "c"));
		assert.strictEqual(
			files.parentPath("src/utils/helper.ts"),
			path.join(tempDir, "src/utils"),
		);
	});

	it("writes, reads and deletes files with byte metadata", async () => {
		const filePath = "tmp/data.txt";
		const content = "hello susee";

		await files.writeFile(filePath, content);
		assert.strictEqual(files.existsPath(filePath), true);

		const read = await files.readFile(filePath);
		assert.strictEqual(read.str, content);
		assert.strictEqual(read.bytes, Buffer.byteLength(content));

		await files.deleteFile(filePath);
		assert.strictEqual(files.existsPath(filePath), false);
	});

	it("creates directories recursively and clears folder contents", async () => {
		await files.createDirectory("build/nested");
		assert.strictEqual(files.existsPath("build/nested"), true);

		await files.writeFile("build/one.txt", "1");
		await files.writeFile("build/nested/two.txt", "2");
		await files.clearFolder("build");

		const buildPath = path.join(tempDir, "build");
		assert.deepStrictEqual(fs.readdirSync(buildPath), []);
		await files.clearFolder("missing-folder");
	});

	it("reads and parses JSON files", async () => {
		await files.writeFile(
			"config.json",
			JSON.stringify({ enabled: true, retry: 2 }),
		);
		const json = await files.readJsonFile("config.json");

		assert.deepStrictEqual(json, { enabled: true, retry: 2 });
	});

	it("writes package.json main fields for root export", async () => {
		seedPackageJson({ sideEffects: false });

		await files.writePackageJson(
			{
				commonjs: path.join(tempDir, "dist/index.cjs"),
				commonjsTypes: path.join(tempDir, "dist/index.d.cts"),
				esm: path.join(tempDir, "dist/index.mjs"),
				esmTypes: path.join(tempDir, "dist/index.d.mts"),
				main: path.join(tempDir, "dist/index.cjs"),
				module: path.join(tempDir, "dist/index.mjs"),
				types: path.join(tempDir, "dist/index.d.mts"),
			},
			".",
		);

		const pkg = JSON.parse(
			fs.readFileSync(path.join(tempDir, "package.json"), "utf8"),
		);
		assert.strictEqual(pkg.type, "module");
		assert.strictEqual(pkg.main, "dist/index.cjs");
		assert.strictEqual(pkg.module, "dist/index.mjs");
		assert.strictEqual(pkg.types, "dist/index.d.mts");
		assert.strictEqual(pkg.sideEffects, false);
		assert.deepStrictEqual(pkg.exports["."], {
			import: {
				types: "./dist/index.d.mts",
				default: "./dist/index.mjs",
			},
			require: {
				types: "./dist/index.d.cts",
				default: "./dist/index.cjs",
			},
		});
	});

	it("merges subpath exports without changing root main/module/types", async () => {
		seedPackageJson({
			main: "dist/root.cjs",
			module: "dist/root.mjs",
			types: "dist/root.d.ts",
			exports: {
				".": {
					import: {
						types: "./dist/root.d.ts",
						default: "./dist/root.mjs",
					},
				},
			},
		});

		await files.writePackageJson(
			{
				commonjs: path.join(tempDir, "dist/feature.cjs"),
				commonjsTypes: path.join(tempDir, "dist/feature.d.cts"),
				esm: path.join(tempDir, "dist/feature.mjs"),
				esmTypes: path.join(tempDir, "dist/feature.d.mts"),
				main: undefined,
				module: undefined,
				types: undefined,
			},
			"./feature",
		);

		const pkg = JSON.parse(
			fs.readFileSync(path.join(tempDir, "package.json"), "utf8"),
		);
		assert.strictEqual(pkg.main, "dist/root.cjs");
		assert.strictEqual(pkg.module, "dist/root.mjs");
		assert.strictEqual(pkg.types, "dist/root.d.ts");
		assert.deepStrictEqual(pkg.exports["./feature"], {
			import: {
				types: "./dist/feature.d.mts",
				default: "./dist/feature.mjs",
			},
			require: {
				types: "./dist/feature.d.cts",
				default: "./dist/feature.cjs",
			},
		});
	});
});
