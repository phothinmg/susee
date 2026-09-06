import { test, describe } from "node:test";
import assert from "node:assert/strict";
import ts6 from "@suseejs/ts6";
import { suseeCompiler } from "../../src/compiler/suseeCompiler.ts";

describe("suseeCompiler", () => {
  test("compiles a simple ESM module to CommonJS", () => {
    const code = "export const x = 42;\n";
    const result = suseeCompiler({
      sourceCode: code,
      fileName: "index.ts",
      compilerOptions: {
        outDir: "dist",
        module: ts6.ModuleKind.CommonJS,
        target: ts6.ScriptTarget.Latest,
      },
    });
    assert.ok(result.code.length > 0);
    assert.equal(result.file_name, "index");
    assert.equal(result.out_dir, "dist");
    // CommonJS emit uses exports.x = or Object.defineProperty
    assert.ok(result.code.includes("exports.") || result.code.includes("Object.defineProperty"));
  });

  test("compiles a simple ESM module to ESM output", () => {
    const code = "export const y = 99;\n";
    const result = suseeCompiler({
      sourceCode: code,
      fileName: "mod.ts",
      compilerOptions: {
        outDir: "dist",
        module: ts6.ModuleKind.ES2020,
        target: ts6.ScriptTarget.Latest,
      },
    });
    assert.ok(result.code.includes("export"));
  });

  test("produces declaration file when declaration is enabled", () => {
    const code = "export const d = 1;\n";
    const result = suseeCompiler({
      sourceCode: code,
      fileName: "decl.ts",
      compilerOptions: {
        outDir: "dist",
        module: ts6.ModuleKind.ES2020,
        target: ts6.ScriptTarget.Latest,
        declaration: true,
      },
    });
    assert.ok(result.dts, "should produce dts");
    assert.ok(result.dts!.includes("export declare const d"));
  });

  test("produces source map when sourceMap is enabled", () => {
    const code = "export const s = 2;\n";
    const result = suseeCompiler({
      sourceCode: code,
      fileName: "src.ts",
      compilerOptions: {
        outDir: "dist",
        module: ts6.ModuleKind.ES2020,
        target: ts6.ScriptTarget.Latest,
        sourceMap: true,
      },
    });
    assert.ok(result.map, "should produce source map");
    assert.ok(result.map!.includes("version"));
  });

  test("does not produce dts when declaration is not enabled", () => {
    const code = "export const nod = 1;\n";
    const result = suseeCompiler({
      sourceCode: code,
      fileName: "nod.ts",
      compilerOptions: {
        outDir: "dist",
        module: ts6.ModuleKind.ES2020,
        target: ts6.ScriptTarget.Latest,
      },
    });
    assert.equal(result.dts, undefined);
  });

  test("extracts file_name from the emitted key", () => {
    const code = "export const f = 1;\n";
    const result = suseeCompiler({
      sourceCode: code,
      fileName: "myfile.ts",
      compilerOptions: {
        outDir: "out",
        module: ts6.ModuleKind.ES2020,
        target: ts6.ScriptTarget.Latest,
      },
    });
    assert.equal(result.file_name, "myfile");
  });

  test("jsxCompilerOptions passthrough when isJsx is false", () => {
    const code = "export const a = 1;\n";
    const result = suseeCompiler({
      sourceCode: code,
      fileName: "nojsx.ts",
      compilerOptions: {
        outDir: "dist",
        module: ts6.ModuleKind.ES2020,
        target: ts6.ScriptTarget.Latest,
      },
      isJsx: false,
    });
    assert.ok(result.code.includes("export"));
  });
});