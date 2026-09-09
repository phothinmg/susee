import { test, describe } from "node:test";
import assert from "node:assert/strict";
import ts6 from "@suseejs/ts6";
import { getCompilerOptions } from "../../src/compiler/tsoptions.js";

describe("getCompilerOptions", () => {
  test("returns an object with commonjs, esm, and defaultOptions functions", () => {
    const opts = getCompilerOptions();
    assert.equal(typeof opts.commonjs, "function");
    assert.equal(typeof opts.esm, "function");
    assert.equal(typeof opts.defaultOptions, "function");
  });

  test("commonjs() returns CommonJS module kind", () => {
    const opts = getCompilerOptions();
    const cjs = opts.commonjs("dist");
    assert.equal(cjs.module, ts6.ModuleKind.CommonJS);
    assert.equal(cjs.outDir, "dist");
  });

  test("esm() returns ES2020 module kind", () => {
    const opts = getCompilerOptions();
    const esm = opts.esm("dist");
    assert.equal(esm.module, ts6.ModuleKind.ES2020);
    assert.equal(esm.outDir, "dist");
  });

  test("commonjs() defaults outDir to 'dist' when no arg", () => {
    const opts = getCompilerOptions();
    const cjs = opts.commonjs();
    assert.equal(cjs.outDir, "dist");
  });

  test("esm() defaults outDir to 'dist' when no arg", () => {
    const opts = getCompilerOptions();
    const esm = opts.esm();
    assert.equal(esm.outDir, "dist");
  });

  test("commonjs() sets target when no tsconfig", () => {
    const opts = getCompilerOptions();
    const cjs = opts.commonjs("build");
    // When no tsconfig is found, default target is set
    assert.equal(cjs.target, ts6.ScriptTarget.Latest);
  });

  test("esm() sets target when no tsconfig", () => {
    const opts = getCompilerOptions();
    const esm = opts.esm("build");
    assert.equal(esm.target, ts6.ScriptTarget.Latest);
  });

  test("defaultOptions() returns compiler options", () => {
    const opts = getCompilerOptions();
    const def = opts.defaultOptions();
    assert.equal(typeof def, "object");
    assert.ok(def !== null);
  });
});