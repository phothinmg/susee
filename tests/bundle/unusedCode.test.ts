import assert from "node:assert";
import { describe, it } from "node:test";
import type ts from "typescript";
import clearUnusedCode from "../../src/lib/bundle/handlers/unusedCode.js";

describe("Clear Unused Code Tests", () => {
  it("removes only unused named imports and drops unused default import declarations", () => {
    const input = [
      'import keepDefault, { keepNamed, dropNamed } from "pkg";',
      'import dropDefault from "unused-pkg";',
      "const value = keepDefault + keepNamed;",
      "console.log(value);",
      "",
    ].join("\n");

    const output = clearUnusedCode(
      input,
      "/virtual/entry.ts",
      {} as ts.CompilerOptions,
    );

    assert.match(output, /import keepDefault, \{ keepNamed \} from "pkg";/);
    assert.doesNotMatch(output, /dropNamed/);
    assert.doesNotMatch(output, /unused-pkg/);
    assert.match(output, /const value = keepDefault \+ keepNamed;/);
    assert.match(output, /console\.log\(value\);/);
  });

  it("drops whole namespace import declaration when unused", () => {
    const input = [
      'import * as pkg from "pkg";',
      "const value = 1;",
      "console.log(value);",
      "",
    ].join("\n");

    const output = clearUnusedCode(
      input,
      "/virtual/entry.ts",
      {} as ts.CompilerOptions,
    );

    assert.doesNotMatch(output, /import \* as pkg from "pkg";/);
    assert.match(output, /const value = 1;/);
    assert.match(output, /console\.log\(value\);/);
  });

  it("drops whole import declaration when default import is unused even if named imports are used", () => {
    const input = [
      'import dropDefault, { keepNamed } from "pkg";',
      "const value = keepNamed;",
      "console.log(value);",
      "",
    ].join("\n");

    const output = clearUnusedCode(
      input,
      "/virtual/entry.ts",
      {} as ts.CompilerOptions,
    );

    assert.doesNotMatch(output, /from "pkg"/);
    assert.match(output, /const value = keepNamed;/);
    assert.match(output, /console\.log\(value\);/);
  });

  it("removes unused top-level functions, classes, and variable statements", () => {
    const input = [
      "function usedFn() { return 1; }",
      "function dropFn() { return 2; }",
      "class UsedClass {}",
      "class DropClass {}",
      "const usedValue = usedFn();",
      "const dropValue = 10;",
      "const instance = new UsedClass();",
      "console.log(usedValue, instance);",
      "",
    ].join("\n");

    const output = clearUnusedCode(
      input,
      "/virtual/entry.ts",
      {} as ts.CompilerOptions,
    );

    assert.match(output, /function usedFn\(\)/);
    assert.match(output, /class UsedClass/);
    assert.match(output, /const usedValue = usedFn\(\);/);
    assert.match(output, /const instance = new UsedClass\(\);/);
    assert.doesNotMatch(output, /function dropFn\(\)/);
    assert.doesNotMatch(output, /class DropClass/);
    assert.doesNotMatch(output, /const dropValue = 10;/);
  });

  it("respects treatExportsAsUsed option", () => {
    const input = [
      "export function keepMe() { return 1; }",
      "export const keepValue = 1;",
      "",
    ].join("\n");

    const defaultOutput = clearUnusedCode(
      input,
      "/virtual/entry.ts",
      {} as ts.CompilerOptions,
    );
    const strictOutput = clearUnusedCode(
      input,
      "/virtual/entry.ts",
      {} as ts.CompilerOptions,
      { treatExportsAsUsed: false },
    );

    assert.match(defaultOutput, /export function keepMe\(\)/);
    assert.match(defaultOutput, /export const keepValue = 1;/);
    assert.doesNotMatch(strictOutput, /keepMe/);
    assert.doesNotMatch(strictOutput, /keepValue/);
  });
});
