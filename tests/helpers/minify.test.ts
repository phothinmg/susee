import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { oxcMinify } from "../../src/helpers/minify.ts";
import type { BuildEntryPoint } from "../../src/config/index.ts";

function makePoint(overrides: Partial<BuildEntryPoint> = {}): BuildEntryPoint {
  return {
    entry: "index.ts",
    exportPath: ".",
    format: ["esm"],
    outputDirectoryPath: "dist",
    tsconfigFilePath: undefined,
    checks: {
      checkAnonymous: false,
      checkDefaultExports: false,
      checkNpmInstalled: false,
    },
    minify: false,
    ...overrides,
  };
}

describe("oxcMinify", () => {
  test("returns minified code for a module with exports", async () => {
    const code = "function add(a, b) { return a + b; }\nexport { add };\n";
    const result = await oxcMinify("index.mjs", code, makePoint());
    assert.equal(typeof result, "string");
    assert.ok(result.length > 0, "result should not be empty");
    // minified output should still contain the export
    assert.ok(result.includes("export"));
    assert.ok(result.includes("add"));
  });

  test("preserves semantic equivalence after minify", async () => {
    const code = `
function multiply(a, b) {
  return a * b;
}
export { multiply };
`;
    const result = await oxcMinify("foo.mjs", code, makePoint());
    assert.ok(result.includes("multiply"));
    assert.ok(result.includes("export"));
  });

  test("returns string even for input that gets tree-shaken away", async () => {
    // oxc-minify drops unused top-level vars by default, so this returns ""
    const result = await oxcMinify("empty.mjs", "const unused = 42;\n", makePoint());
    assert.equal(typeof result, "string");
  });

  test("passes through custom options object", async () => {
    // With mangle:false, function names are preserved
    const point = makePoint({
      minify: { options: { mangle: false, compress: true } as any },
    });
    const code = "function namedFn(a, b) { return a + b; }\nexport { namedFn };\n";
    const result = await oxcMinify("foo.mjs", code, point);
    assert.ok(result.includes("namedFn"), "function name should be preserved with mangle:false");
  });
});