import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cliConfig, cliBundleOpts } from "../../src/cli/parse_args.js";

describe("cliConfig", () => {
  test("returns undefined for empty argv", () => {
    assert.equal(cliConfig([]), undefined);
  });

  test("returns undefined when only flags with no entry are given", () => {
    assert.equal(cliConfig(["--outdir", "dist"]), undefined);
  });

  test("parses a positional entry file", () => {
    const cfg = cliConfig(["src/index.ts"])!;
    assert.equal(cfg.entryPoints[0]!.entry, "src/index.ts");
    assert.equal(cfg.entryPoints[0]!.exportPath, ".");
    assert.deepEqual(cfg.entryPoints[0]!.format, ["esm"]);
    assert.equal(cfg.outDir, "dist");
    assert.equal(cfg.allowUpdatePackageJson, false);
  });

  test("parses --entry with separate value", () => {
    const cfg = cliConfig(["--entry", "src/foo.ts"])!;
    assert.equal(cfg.entryPoints[0]!.entry, "src/foo.ts");
  });

  test("parses --entry=inline value", () => {
    const cfg = cliConfig(["--entry=src/inline.ts"])!;
    assert.equal(cfg.entryPoints[0]!.entry, "src/inline.ts");
  });

  test("parses --outdir", () => {
    const cfg = cliConfig(["src/index.ts", "--outdir", "build"])!;
    assert.equal(cfg.outDir, "build");
  });

  test("defaults outDir to dist", () => {
    const cfg = cliConfig(["src/index.ts"])!;
    assert.equal(cfg.outDir, "dist");
  });

  test("parses --format esm", () => {
    const cfg = cliConfig(["src/index.ts", "--format", "esm"])!;
    assert.deepEqual(cfg.entryPoints[0]!.format, ["esm"]);
  });

  test("parses --format cjs", () => {
    const cfg = cliConfig(["src/index.ts", "--format", "cjs"])!;
    assert.deepEqual(cfg.entryPoints[0]!.format, ["commonjs"]);
  });

  test("parses --format commonjs", () => {
    const cfg = cliConfig(["src/index.ts", "--format", "commonjs"])!;
    assert.deepEqual(cfg.entryPoints[0]!.format, ["commonjs"]);
  });

  test("parses --format both", () => {
    const cfg = cliConfig(["src/index.ts", "--format", "both"])!;
    assert.deepEqual(cfg.entryPoints[0]!.format, ["commonjs", "esm"]);
  });

  test("parses --tsconfig", () => {
    const cfg = cliConfig(["src/index.ts", "--tsconfig", "tsconfig.build.json"])!;
    assert.equal(cfg.entryPoints[0]!.tsconfigFilePath, "tsconfig.build.json");
  });

  test("parses --allow-update as bare flag (defaults true)", () => {
    const cfg = cliConfig(["src/index.ts", "--allow-update"])!;
    assert.equal(cfg.allowUpdatePackageJson, true);
  });

  test("parses --allow-update=true", () => {
    const cfg = cliConfig(["src/index.ts", "--allow-update=true"])!;
    assert.equal(cfg.allowUpdatePackageJson, true);
  });

  test("parses --allow-update=false", () => {
    const cfg = cliConfig(["src/index.ts", "--allow-update=false"])!;
    assert.equal(cfg.allowUpdatePackageJson, false);
  });

  test("parses --minify as bare flag", () => {
    const cfg = cliConfig(["src/index.ts", "--minify"])!;
    assert.equal(cfg.entryPoints[0]!.minify, true);
  });

  test("parses --minify=false", () => {
    const cfg = cliConfig(["src/index.ts", "--minify=false"])!;
    assert.equal(cfg.entryPoints[0]!.minify, false);
  });

  test("parses --check as bare flag and sets all checks", () => {
    const cfg = cliConfig(["src/index.ts", "--check"])!;
    assert.equal(cfg.entryPoints[0]!.checks?.checkAnonymous, true);
    assert.equal(cfg.entryPoints[0]!.checks.checkDefaultExports, true);
    assert.equal(cfg.entryPoints[0]!.checks.checkNpmInstalled, true);
  });

  test("parses --check=false and leaves checks false", () => {
    const cfg = cliConfig(["src/index.ts", "--check=false"])!;
    assert.equal(cfg.entryPoints[0]!.checks?.checkAnonymous, false);
    assert.equal(cfg.entryPoints[0]!.checks.checkDefaultExports, false);
    assert.equal(cfg.entryPoints[0]!.checks.checkNpmInstalled, false);
  });

  test("does not treat non-file positional args as entry", () => {
    // "build" has no extension so it isn't treated as a file
    assert.equal(cliConfig(["build"]), undefined);
  });
});

describe("cliBundleOpts", () => {
  test("returns undefined for empty argv", () => {
    assert.equal(cliBundleOpts([]), undefined);
  });

  test("returns undefined when no entry is provided", () => {
    assert.equal(cliBundleOpts(["--outdir", "out"]), undefined);
  });

  test("parses positional entry file", () => {
    const opts = cliBundleOpts(["src/index.ts"])!;
    assert.equal(opts.entry, "src/index.ts");
    assert.equal(opts.outDir, undefined);
    assert.equal(opts.check, undefined);
  });

  test("parses --outdir", () => {
    const opts = cliBundleOpts(["src/index.ts", "--outdir", "bundle-out"])!;
    assert.equal(opts.outDir, "bundle-out");
  });

  test("parses --check as bare flag", () => {
    const opts = cliBundleOpts(["src/index.ts", "--check"])!;
    assert.deepEqual(opts.check, {
      checkAnonymous: true,
      checkDefaultExports: true,
      checkNpmInstalled: true,
    });
  });

  test("parses --check=false", () => {
    const opts = cliBundleOpts(["src/index.ts", "--check=false"])!;
    assert.equal(opts.check, undefined);
  });

  test("parses --entry=inline", () => {
    const opts = cliBundleOpts(["--entry=src/inline.ts"])!;
    assert.equal(opts.entry, "src/inline.ts");
  });
});