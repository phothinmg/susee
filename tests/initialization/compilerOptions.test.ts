import assert from "node:assert";
import { describe, it } from "node:test";
import ts from "typescript";
import { compilerOptions } from "../../src/lib/initialization/compilerOptions.js";
import {
	type Point,
	finalSuseeConfig,
} from "../../src/lib/initialization/suseeConfig.js";

describe("Tests for tsconfig and compiler options", () => {
	it("Get correct options", async () => {
		const cwd = process.cwd();
		const temp = ts.sys.resolvePath(
			"tests/initialization/ts_config/correct_options",
		);
		process.chdir(temp);
		try {
			const __config = await finalSuseeConfig();
			const point_one = (__config.points as Point[])?.[0] as Point;
			const opt_one = compilerOptions(point_one);
			const point_two = __config.points[1] as Point;
			const opt_two = compilerOptions(point_two);
			// correct module type
			assert.deepEqual(opt_one.commonjs.module, 1);
			assert.deepEqual(opt_one.esm.module, 6);
			// correct outDir
			assert.deepEqual(opt_two.commonjs.outDir, "dist/mod");
			assert.deepEqual(opt_two.esm.outDir, "dist/mod");
			// undefined rootDir
			assert.deepEqual(opt_one.commonjs.rootDir, undefined);
			assert.deepEqual(opt_one.esm.rootDir, undefined);
		} finally {
			process.chdir(cwd);
		}
	});
	it("With custom config path", async () => {
		const cwd = process.cwd();
		const temp = ts.sys.resolvePath(
			"tests/initialization/ts_config/custom_path",
		);
		process.chdir(temp);
		try {
			const __config = await finalSuseeConfig();
			const point_one = (__config.points as Point[])?.[0] as Point;
			const opt_one = compilerOptions(point_one);
			const point_two = __config.points[1] as Point;
			const opt_two = compilerOptions(point_two);
			// correct module type
			assert.deepEqual(opt_one.commonjs.module, 1);
			assert.deepEqual(opt_one.esm.module, 6);
			// custom config check removeComments
			assert.deepEqual(opt_one.esm.removeComments, undefined);
			// custom config check removeComments
			assert.deepEqual(opt_one.commonjs.declaration, undefined);
			// correct outDir
			assert.deepEqual(opt_two.commonjs.outDir, "dist/mod");
			assert.deepEqual(opt_two.esm.outDir, "dist/mod");
			// undefined rootDir
			assert.deepEqual(opt_one.commonjs.rootDir, undefined);
			assert.deepEqual(opt_one.esm.rootDir, undefined);
		} finally {
			process.chdir(cwd);
		}
	});
});
