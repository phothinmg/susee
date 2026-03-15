import assert from "node:assert";
import { describe, it } from "node:test";
import ts from "typescript";
import initializer from "../../src/lib/initialization/index.js";

describe("initializer", () => {
	it("collects initialization data from config", async () => {
		const cwd = process.cwd();
		const temp = ts.sys.resolvePath("tests/initialization/get_config/ok");
		process.chdir(temp);
		try {
			const result = await initializer();
			assert.strictEqual(result.allowUpdatePackageJson, true);
			assert.strictEqual(result.points.length, 1);

			const point = result.points[0];
			assert.ok(point);
			assert.strictEqual(point.fileName, "src/index.ts");
			assert.strictEqual(point.exportPath, ".");
			assert.strictEqual(point.format, "both");
			assert.strictEqual(point.rename, true);
			assert.strictEqual(point.outDir, "dist");
			assert.strictEqual(point.plugins.length, 0);
			assert.strictEqual(point.depFiles.length, 1);
			const depFile = point.depFiles[0];
			assert.ok(depFile);
			assert.strictEqual(depFile.fileExt, ".ts");
			assert.strictEqual(point.tsOptions.cjs.module, ts.ModuleKind.CommonJS);
			assert.strictEqual(point.tsOptions.esm.module, ts.ModuleKind.ES2020);
		} finally {
			process.chdir(cwd);
		}
	});
});
