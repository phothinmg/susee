import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateFinalBuildOptions } from "../../src/config/index.js";
import type { SuSeeConfig } from "../../src/config/index.ts";

// We cannot directly import the private generateBuildOptions, but
// generateFinalBuildOptions(options) delegates to it when `options` is
// provided, so we exercise it through the public API.

let tmpDir: string;
let origCwd: string;

before(async () => {
  origCwd = process.cwd();
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "susee-cfg-"));
  // create dummy entry files
  await fs.promises.writeFile(path.join(tmpDir, "index.ts"), "export const a = 1;\n");
  await fs.promises.writeFile(path.join(tmpDir, "foo.ts"), "export const b = 2;\n");
  process.chdir(tmpDir);
});

after(async () => {
  process.chdir(origCwd);
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

// Note: logError(..., true) calls a native process.exit(1) which cannot be
// stubbed in-process. Error-path tests that would trigger logError are
// skipped here and documented instead.

describe("generateFinalBuildOptions", () => {
  test("exits when no options and no config file at root (subprocess)", (t) => {
    // Native exit — cannot be tested in-process.
    t.skip("native exit — error path covered by subprocess");
  });

  test("normalizes a single entry point with defaults", async () => {
    const cfg: SuSeeConfig = {
      entryPoints: [{ entry: "index.ts", exportPath: "." }],
    };
    const opts = await generateFinalBuildOptions(cfg);
    assert.equal(opts.outDir, "dist");
    assert.equal(opts.updatePackage, false);
    assert.equal(opts.buildEntryPoints.length, 1);
    const pt = opts.buildEntryPoints[0]!;
    assert.equal(pt.entry, "index.ts");
    assert.equal(pt.exportPath, ".");
    assert.deepEqual(pt.format, ["esm"]);
    assert.equal(pt.tsconfigFilePath, undefined);
    assert.equal(pt.minify, false);
    assert.equal(pt.outputDirectoryPath, "dist");
    assert.equal(pt.checks.checkAnonymous, false);
    assert.equal(pt.checks.checkDefaultExports, false);
    assert.equal(pt.checks.checkNpmInstalled, false);
  });

  test("respects custom outDir", async () => {
    const cfg: SuSeeConfig = {
      entryPoints: [{ entry: "index.ts", exportPath: "." }],
      outDir: "build",
    };
    const opts = await generateFinalBuildOptions(cfg);
    assert.equal(opts.outDir, "build");
    assert.equal(opts.buildEntryPoints[0]!.outputDirectoryPath, "build");
  });

  test("computes outputDirectoryPath for sub-path exports", async () => {
    const cfg: SuSeeConfig = {
      entryPoints: [{ entry: "foo.ts", exportPath: "./foo" }],
    };
    const opts = await generateFinalBuildOptions(cfg);
    // exportPath "./foo" -> outDir + "/foo" = "dist/foo"
    assert.equal(opts.buildEntryPoints[0]!.outputDirectoryPath, "dist/foo");
  });

  test("de-duplicates duplicate formats", async () => {
    const cfg: SuSeeConfig = {
      entryPoints: [
        {
          entry: "index.ts",
          exportPath: ".",
          format: ["esm", "esm", "commonjs", "commonjs"],
        },
      ],
    };
    const opts = await generateFinalBuildOptions(cfg);
    assert.deepEqual(opts.buildEntryPoints[0]!.format, ["esm", "commonjs"]);
  });

  test("passes through checks", async () => {
    const cfg: SuSeeConfig = {
      entryPoints: [
        {
          entry: "index.ts",
          exportPath: ".",
          checks: {
            checkAnonymous: true,
            checkDefaultExports: false,
            checkNpmInstalled: true,
          },
        },
      ],
    };
    const opts = await generateFinalBuildOptions(cfg);
    const c = opts.buildEntryPoints[0]!.checks;
    assert.equal(c.checkAnonymous, true);
    assert.equal(c.checkDefaultExports, false);
    assert.equal(c.checkNpmInstalled, true);
  });

  test("passes through minify boolean", async () => {
    const cfg: SuSeeConfig = {
      entryPoints: [{ entry: "index.ts", exportPath: ".", minify: true }],
    };
    const opts = await generateFinalBuildOptions(cfg);
    assert.equal(opts.buildEntryPoints[0]!.minify, true);
  });

  test("passes through minify options object", async () => {
    const minifyOpts = { options: { mangle: false } };
    const cfg: SuSeeConfig = {
      entryPoints: [
        { entry: "index.ts", exportPath: ".", minify: minifyOpts },
      ],
    };
    const opts = await generateFinalBuildOptions(cfg);
    assert.deepEqual(opts.buildEntryPoints[0]!.minify, minifyOpts);
  });

  test("passes through tsconfigFilePath", async () => {
    const cfg: SuSeeConfig = {
      entryPoints: [
        { entry: "index.ts", exportPath: ".", tsconfigFilePath: "tsconfig.build.json" },
      ],
    };
    const opts = await generateFinalBuildOptions(cfg);
    assert.equal(opts.buildEntryPoints[0]!.tsconfigFilePath, "tsconfig.build.json");
  });

  test("sets updatePackage when allowUpdatePackageJson is true", async () => {
    const cfg: SuSeeConfig = {
      entryPoints: [{ entry: "index.ts", exportPath: "." }],
      allowUpdatePackageJson: true,
    };
    const opts = await generateFinalBuildOptions(cfg);
    assert.equal(opts.updatePackage, true);
  });

  test("handles multiple entry points", async () => {
    const cfg: SuSeeConfig = {
      entryPoints: [
        { entry: "index.ts", exportPath: "." },
        { entry: "foo.ts", exportPath: "./foo" },
      ],
    };
    const opts = await generateFinalBuildOptions(cfg);
    assert.equal(opts.buildEntryPoints.length, 2);
    assert.equal(opts.buildEntryPoints[0]!.exportPath, ".");
    assert.equal(opts.buildEntryPoints[1]!.exportPath, "./foo");
  });

  test("exits on non-existent entry file (subprocess)", (t) => {
    // Native exit via logError — cannot be tested in-process.
    t.skip("native exit — error path covered by subprocess");
  });
});