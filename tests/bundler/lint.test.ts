import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { suseeLint } from "@suseejs/susee_bundler";
import type { LintOptions, LintResult } from "@suseejs/susee_bundler";

/**
 * Integration tests for `suseeLint` against the v3.0.0 core bundler
 * (`@suseejs/susee_bundler` 0.3.0), where the tree-stage checks moved
 * from `suseeBundler` (v2.x) to the lint command.
 *
 * Hard gates (always run, severity "error"):
 *   - `duplicate-decl` — cross-file duplicate top-level declarations
 *   - `undefined-usage` — value-level references that resolve to nothing
 *
 * Optional checks (severity "warning"):
 *   - `export-default` — every `export default` statement
 *   - `anonymous-export` — anonymous default exports imported elsewhere
 *   - `npm-not-declared` / `npm-not-installed` — v3.0.0 two-phase npm
 *     dependency check (declared in package.json AND installed)
 */

const NO_CHECKS: LintOptions = {
  checkAnonymous: false,
  checkDefaultExports: false,
  checkNpmInstalled: false,
};

/** Create a temp project with the given relative-path files. */
function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "susee-lint-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

/** Run lint and clean up. */
function lint(
  files: Record<string, string>,
  entry: string,
  options: LintOptions = NO_CHECKS,
): LintResult {
  const dir = makeProject(files);
  try {
    return suseeLint(entry, dir, options);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const rules = (diags: Array<{ rule: string }>) => diags.map((d) => d.rule);

/**
 * Run `checkNpmInstalled: true` against a project in a CHILD node process
 * and capture stderr.
 *
 * Why a subprocess: with `checkNpmInstalled` enabled, the tree stage runs
 * `check_npm_installed`, which logs an error and calls the native
 * `process::exit(1)` inside the napi addon. That cannot be stubbed
 * in-process, so the failure path must be exercised out-of-process.
 */
function npmCheckStderr(
  files: Record<string, string>,
  entry: string,
): { status: number | null; stderr: string } {
  const dir = makeProject(files);
  try {
    const script = [
      "const { suseeLint } = require('@suseejs/susee_bundler');",
      `suseeLint(${JSON.stringify(entry)}, ${JSON.stringify(dir)}, { checkAnonymous: false, checkDefaultExports: false, checkNpmInstalled: true });`,
    ].join("\n");
    const proc = spawnSync(process.execPath, ["-e", script], { encoding: "utf8" });
    return { status: proc.status, stderr: proc.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("suseeLint hard gates", () => {
  test("reports duplicate-decl for cross-file duplicates (now lint-only)", () => {
    const r = lint(
      {
        "a.ts": "const config = 1;\nexport const useA = config;\n",
        "b.ts": "const config = 2;\nexport const useB = config;\n",
        "index.ts":
          'import { useA } from "./a.js";\nimport { useB } from "./b.js";\nexport const main = useA + useB;\n',
      },
      "index.ts",
    );
    assert.ok(r.errors.length > 0, `duplicate must be reported:\n${JSON.stringify(r.errors)}`);
    assert.ok(rules(r.errors).includes("duplicate-decl"), `rules: ${rules(r.errors)}`);
    const dup = r.errors.find((e) => e.rule === "duplicate-decl");
    assert.ok(dup, "duplicate-decl diagnostic must exist");
    assert.equal(
      dup!.message.includes("config"),
      true,
      `message should name the identifier: ${dup!.message}`,
    );
    // Location points at one of the declaring files.
    assert.ok(dup!.file === "a.ts" || dup!.file === "b.ts", `file: ${dup!.file}`);
    assert.ok(dup!.line >= 1, "line should be 1-based");
  });

  test("does not report duplicate-decl when names are unique per file", () => {
    const r = lint(
      {
        "a.ts": "export const useA = 1;\n",
        "b.ts": "export const useB = 2;\n",
        "index.ts":
          'import { useA } from "./a.js";\nimport { useB } from "./b.js";\nexport const main = useA + useB;\n',
      },
      "index.ts",
    );
    assert.ok(!rules(r.errors).includes("duplicate-decl"), `rules: ${rules(r.errors)}`);
  });

  test("does not report CJS require-imports as duplicates", () => {
    const r = lint(
      {
        "foo.cjs": "class Foo {}\nmodule.exports = { Foo };\n",
        "index.cjs": 'const { Foo } = require("./foo.cjs");\nconsole.log(Foo);\n',
      },
      "index.cjs",
    );
    assert.ok(
      !rules(r.errors).includes("duplicate-decl"),
      `require-import must not be a duplicate:\n${JSON.stringify(r.errors)}`,
    );
  });

  test("reports undefined-usage for unresolved value references", () => {
    const r = lint(
      {
        "index.ts": "export const main = totallyUndefined + 1;\n",
      },
      "index.ts",
    );
    assert.ok(rules(r.errors).includes("undefined-usage"), `rules: ${rules(r.errors)}`);
    const und = r.errors.find((e) => e.rule === "undefined-usage");
    assert.ok(und, "undefined-usage diagnostic must exist");
    // The summary is in `message`; the identifier list is in `details`.
    assert.ok(
      und.message.includes("undefined identifier"),
      `message should summarize the finding: ${und.message}`,
    );
    assert.ok(
      und.details.some((d) => d.includes("totallyUndefined")),
      `details should name the identifier:\n${JSON.stringify(und.details)}`,
    );
  });

  test("reports no errors for a clean project", () => {
    const r = lint(
      {
        "a.ts": "export const useA = 1;\n",
        "index.ts": 'import { useA } from "./a.js";\nexport const main = useA + 1;\n',
      },
      "index.ts",
    );
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });
});

describe("suseeLint optional checks (warnings)", () => {
  test("reports export-default when checkDefaultExports is enabled", () => {
    const r = lint(
      {
        "a.ts": "export default function hi() { return 1; }\n",
        "index.ts": 'import hi from "./a.js";\nexport const main = hi;\n',
      },
      "index.ts",
      { ...NO_CHECKS, checkDefaultExports: true },
    );
    assert.ok(rules(r.warnings).includes("export-default"), `warnings: ${rules(r.warnings)}`);
    assert.ok(
      !rules(r.errors).includes("export-default"),
      "export-default is a warning, not an error",
    );
  });

  test("does not report export-default when the check is disabled", () => {
    const r = lint(
      {
        "a.ts": "export default function hi() { return 1; }\n",
        "index.ts": 'import hi from "./a.js";\nexport const main = hi;\n',
      },
      "index.ts",
      NO_CHECKS,
    );
    assert.ok(!rules(r.warnings).includes("export-default"), `warnings: ${rules(r.warnings)}`);
  });

  test("reports anonymous-export for anonymous default imports when enabled", () => {
    const r = lint(
      {
        "anon.ts": "export default function () { return 1; }\n",
        "index.ts": 'import fn from "./anon.js";\nexport const main = fn;\n',
      },
      "index.ts",
      { ...NO_CHECKS, checkAnonymous: true },
    );
    // Anonymous default exported from a non-entry file and imported by the
    // entry — the anonymous-export check should flag it.
    assert.ok(rules(r.warnings).includes("anonymous-export"), `warnings: ${rules(r.warnings)}`);
  });
});

describe("suseeLint npm dependency check (checkNpmInstalled)", () => {
  test("declared + installed package passes without diagnostics", () => {
    const r = lint(
      {
        "package.json": JSON.stringify({ dependencies: { ms: "^1.0.0" } }),
        "node_modules/ms/package.json": JSON.stringify({
          name: "ms",
          version: "1.0.0",
          main: "index.js",
        }),
        "index.ts": 'import ms from "ms";\nexport const main = ms;\n',
      },
      "index.ts",
      { ...NO_CHECKS, checkNpmInstalled: true },
    );
    assert.deepEqual(r.errors, []);
  });

  test("declared but not installed package fails the strict check (subprocess)", () => {
    // `check_npm_installed` runs during tree traversal and exits the native
    // process with code 1 — asserted via a child process.
    const { status, stderr } = npmCheckStderr(
      {
        "package.json": JSON.stringify({ dependencies: { ms: "^1.0.0" } }),
        // node_modules/ms deliberately missing.
        "index.ts": 'import ms from "ms";\nexport const main = ms;\n',
      },
      "index.ts",
    );
    assert.equal(status, 1, `strict npm check must exit(1):\n${stderr}`);
    assert.ok(
      stderr.includes("declared but not installed"),
      `stderr should report the phase:\n${stderr}`,
    );
    assert.ok(stderr.includes("ms"), `stderr should name the package:\n${stderr}`);
  });

  test("bare-import of an undeclared package does not produce npm diagnostics", () => {
    // The dependency graph only classifies a bare specifier as an npm
    // dependency when it is listed in package.json. Undeclared bare
    // imports land in the graph's warning list instead — the strict
    // npm-not-declared diagnostic is therefore defensive in practice.
    // This test pins that classification so a future bundler change
    // that re-routes undeclared imports to npm stays observable.
    //
    // NOTE: this is run in-process because no exit path is taken —
    // undeclared imports are skipped by the strict check entirely.
    const r = lint(
      {
        "index.ts": 'import ms from "ms";\nexport const main = ms;\n',
      },
      "index.ts",
      { ...NO_CHECKS, checkNpmInstalled: true },
    );
    assert.deepEqual(
      r.errors.filter((e) => e.rule.startsWith("npm-")),
      [],
      `undeclared imports must not produce npm diagnostics yet:\n${JSON.stringify(r.errors)}`,
    );
  });

  test("node builtin imports pass the npm check", () => {
    const r = lint(
      {
        "index.ts":
          'import { existsSync } from "node:fs";\nexport const main = typeof existsSync;\n',
      },
      "index.ts",
      { ...NO_CHECKS, checkNpmInstalled: true },
    );
    assert.deepEqual(r.errors, []);
  });
});
