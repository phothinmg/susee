import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import generateDependencies from "../../src/lib/initialization/dependencies.js";
import { setupTempDir } from "../lib/test_helpers.js";

describe("generateDependencies", () => {
	it("returns metadata for a ts entry file", async () => {
		const tmpDir = await setupTempDir("deps");
		const entry = path.join(tmpDir, "index.ts");

		await fs.writeFile(entry, 'export default "esm";\n', "utf8");

		try {
			const result = await generateDependencies(entry);
			assert.strictEqual(result.length, 1);

			const entryMeta = result[0];
			assert.strictEqual(entryMeta?.file, path.resolve(entry));
			assert.strictEqual(entryMeta?.includeDefExport, true);
			assert.strictEqual(entryMeta?.moduleType, "esm");
			assert.strictEqual(entryMeta?.fileExt, ".ts");
			assert.strictEqual(entryMeta?.isJsx, false);

			for (const item of result) {
				assert.strictEqual(item.length, item.content.length);
				assert.strictEqual(item.size.logical, Buffer.byteLength(item.content));
				assert.strictEqual(item.size.utf8, Buffer.byteLength(item.content));
			}
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	it("detects commonjs style module metadata", async () => {
		const tmpDir = await setupTempDir("deps-cjs");
		const entry = path.join(tmpDir, "legacy.ts");

		await fs.writeFile(entry, "module.exports = 1;\n", "utf8");

		try {
			const result = await generateDependencies(entry);
			const meta = result[0];
			assert.strictEqual(meta?.file, path.resolve(entry));
			assert.strictEqual(meta?.moduleType, "cjs");
			assert.strictEqual(meta?.includeDefExport, false);
			assert.strictEqual(meta?.fileExt, ".ts");
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	it("marks cts `export =` files as default-export-like", async () => {
		const tmpDir = await setupTempDir("deps-cts");
		const entry = path.join(tmpDir, "legacy.cts");

		await fs.writeFile(entry, "const value = 1;\nexport = value;\n", "utf8");

		try {
			const result = await generateDependencies(entry);
			const ctsMeta = result[0];
			assert.strictEqual(ctsMeta?.file, path.resolve(entry));
			assert.strictEqual(ctsMeta?.includeDefExport, true);
			assert.strictEqual(ctsMeta?.fileExt, ".cts");
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});

	it("detects jsx content for tsx files", async () => {
		const tmpDir = await setupTempDir("deps-tsx");
		const entry = path.join(tmpDir, "view.tsx");

		await fs.writeFile(
			entry,
			"export const view = <div>hello</div>;\n",
			"utf8",
		);

		try {
			const result = await generateDependencies(entry);
			const meta = result[0];
			assert.strictEqual(meta?.file, path.resolve(entry));
			assert.strictEqual(meta?.fileExt, ".tsx");
			assert.strictEqual(meta?.isJsx, true);
		} finally {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	});
});
