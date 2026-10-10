import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Tests for the v3.0.0 package-level changes of the `susee` wrapper and
 * the `@suseejs/susee_bundler` dependency (0.2.4 → 0.3.0):
 *
 *   - `@suseejs/susee_bundler` is now dual-format (CJS `index.cjs` +
 *     ESM `index.mjs` behind a proper `exports` map).
 *   - This package's `types` entry points at the ESM declaration
 *     (`dist/index.d.mts`, was `dist/index.d.cts`).
 *   - The `./cli` subpath no longer exposes a CommonJS `require`
 *     condition.
 */

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

describe("v3.0.0 dependency: @suseejs/susee_bundler 0.3.0", () => {
  test("package.json declares ^0.3.0 and 0.3.0 is installed", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    assert.equal(pkg.dependencies["@suseejs/susee_bundler"], "^0.3.0");

    const depPkg = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "node_modules/@suseejs/susee_bundler/package.json"),
        "utf8",
      ),
    ) as { version: string; exports: Record<string, unknown> };
    assert.equal(depPkg.version, "0.3.0");
  });

  test("is dual-format: exposes both require and import conditions", () => {
    const depPkg = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "node_modules/@suseejs/susee_bundler/package.json"),
        "utf8",
      ),
    ) as {
      main: string;
      module: string;
      types: string;
      exports: Record<string, { types?: string; import?: string; require?: string }>;
    };
    assert.equal(depPkg.main, "index.cjs");
    assert.equal(depPkg.module, "index.mjs");
    assert.equal(depPkg.types, "index.d.ts");
    const dot = depPkg.exports["."];
    assert.ok(dot, 'exports map must have a "." entry');
    assert.equal(dot.require, "./index.cjs");
    assert.equal(dot.import, "./index.mjs");
    assert.equal(dot.types, "./index.d.ts");
    // Both entry files physically exist.
    for (const f of ["index.cjs", "index.mjs", "index.d.ts"]) {
      assert.ok(
        fs.existsSync(path.join(repoRoot, "node_modules/@suseejs/susee_bundler", f)),
        `${f} must exist`,
      );
    }
  });

  test("CJS require() sees the expected API surface", () => {
    const cjs = require("@suseejs/susee_bundler") as Record<string, unknown>;
    for (const name of [
      "suseeBundler",
      "suseeLint",
      "graph",
      "analyze",
      "logError",
      "logInfo",
      "logWarning",
      "LogTimer",
    ]) {
      assert.ok(name in cjs, `${name} must be present in require() exports`);
      assert.ok(
        typeof cjs[name] === "function" || typeof cjs[name] === "object",
        `${name} must be a function/class via require()`,
      );
    }
  });

  test("ESM import sees the expected API surface", async () => {
    const esm = (await import(
      pathToFileURL(path.join(repoRoot, "node_modules/@suseejs/susee_bundler/index.mjs")).href
    )) as unknown as Record<string, unknown>;
    for (const name of ["suseeBundler", "suseeLint", "graph", "analyze"]) {
      assert.ok(name in esm, `${name} must be present in ESM exports`);
      assert.equal(typeof esm[name], "function", `${name} must be callable via import`);
    }
  });
});

describe("v3.0.0 package metadata (this repo)", () => {
  test("types field points at the ESM declaration", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      types: string;
    };
    assert.equal(pkg.types, "dist/index.d.mts");
  });

  test("./cli subpath is ESM-only (no require condition)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      exports: Record<string, Record<string, unknown>>;
    };
    const cli = pkg.exports["./cli"];
    assert.ok(cli, 'exports map must have a "./cli" entry');
    assert.ok(cli.import, "./cli must expose an import condition");
    assert.equal(cli.require, undefined, "./cli must NOT expose a require condition");
  });
});
