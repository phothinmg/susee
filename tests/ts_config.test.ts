import { describe, it } from "node:test";
import assert from "node:assert";
import ts from "typescript";
import type { Point } from "@suseejs/types";
import getConfig from "../src/lib/init/config.js";
import getOptions from "../src/lib/init/tsCompilerOptions.js";

describe("Tests for tsconfig and compiler options", () => {
  it("Get correct options", async () => {
    const cwd = process.cwd();
    const temp = ts.sys.resolvePath("tests/ts_config/correct_options");
    process.chdir(temp);
    try {
      const __config = await getConfig();
      const point_one = __config.points[0] as Point;
      const opt_one = getOptions(point_one);
      const point_two = __config.points[1] as Point;
      const opt_two = getOptions(point_two);
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
});
