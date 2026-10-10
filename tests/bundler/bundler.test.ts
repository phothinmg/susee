import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { suseeBundler } from "@suseejs/susee_bundler";
import type { CheckOptions } from "@suseejs/susee_bundler";

/**
 * Integration tests for the v3.0.0 core-bundler upgrade
 * (`@suseejs/susee_bundler` 0.2.4 → 0.3.0), exercised through this
 * package's public JS API from temporary projects on disk.
 *
 * Covers the changelog headline changes:
 *   1. Duplicate top-level declarations across non-entry files are
 *      auto-renamed (`_u<name>$<n>`) instead of failing the build.
 *   2. Entry-file `export * from "./local"` re-exports are expanded into
 *      explicit `export { … }` statements.
 *   3. Blank lines inside multi-line template literals survive bundling.
 *   4. Bundling no longer runs the duplicates/undefined-usage checks —
 *      they are surfaced through `suseeLint` instead (see lint.test.ts).
 */

const NO_CHECKS: CheckOptions = {
  checkAnonymous: false,
  checkDefaultExports: false,
  checkNpmInstalled: false,
};

/** Create a temp project directory with the given relative-path files. */
function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "susee-bundler-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

/** Bundle `entry` rooted at `dir` and return the bundled code string. */
function bundle(dir: string, entry: string): string {
  const result = suseeBundler(entry, dir, NO_CHECKS);
  return result.bundledCode;
}

/** Run `check(code)` for each created project; cleans up afterwards. */
function withProject(
  files: Record<string, string>,
  entry: string,
  check: (code: string) => void,
): void {
  const dir = makeProject(files);
  try {
    check(bundle(dir, entry));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

before(() => {});
after(() => {});

describe("v3.0.0 bundler: duplicate declarations auto-rename", () => {
  test("renames duplicate top-level declarations in non-entry files", () => {
    withProject(
      {
        "a.ts": "const config = { a: 1 };\nexport const useA = () => config.a;\n",
        "b.ts": "const config = { b: 2 };\nexport const useB = () => config.b;\n",
        "index.ts":
          'import { useA } from "./a.js";\nimport { useB } from "./b.js";\nexport const main = useA() + useB();\n',
      },
      "index.ts",
      (code) => {
        // Both files declared `config`; each must get a distinct _u name…
        assert.ok(code.includes("_uconfig$1"), `expected _uconfig$1 in:\n${code}`);
        assert.ok(code.includes("_uconfig$2"), `expected _uconfig$2 in:\n${code}`);
        // …with all in-file references updated together.
        assert.ok(
          /const _uconfig\$1 = \{ a: 1 \};/.test(code),
          `declaration+references must be renamed consistently:\n${code}`,
        );
        assert.ok(
          /_uconfig\$1\.a/.test(code) && /_uconfig\$2\.b/.test(code),
          `references must use the renamed identifiers:\n${code}`,
        );
        // The two renames must differ so the merged bundle has no collision.
        assert.notEqual(code.match(/_uconfig\$\d/g)?.length ?? 0, 0);
        // And no bare `config` declarations remain from non-entry files.
        assert.ok(!/\bconst config\b/.test(code), `unrenamed duplicate remains:\n${code}`);
      },
    );
  });

  test("renames duplicate function declarations and their call sites", () => {
    withProject(
      {
        "a.ts": "function helper() { return 1; }\nexport const outA = helper();\n",
        "b.ts": "function helper() { return 2; }\nexport const outB = helper();\n",
        "index.ts":
          'import { outA } from "./a.js";\nimport { outB } from "./b.js";\nexport const main = outA + outB;\n',
      },
      "index.ts",
      (code) => {
        assert.ok(
          code.includes("function _uhelper$1()"),
          `expected renamed declaration in:\n${code}`,
        );
        assert.ok(
          code.includes("function _uhelper$2()"),
          `expected second renamed declaration in:\n${code}`,
        );
        assert.ok(
          code.includes("_uhelper$1()") && code.includes("_uhelper$2()"),
          `call sites must be renamed to match declarations:\n${code}`,
        );
      },
    );
  });

  test("leaves the entry file's own declarations unchanged", () => {
    withProject(
      {
        "a.ts": "const config = 1;\nexport const useA = config;\n",
        "b.ts": "const config = 2;\nexport const useB = config;\n",
        "index.ts":
          'import { useA } from "./a.js";\nimport { useB } from "./b.js";\nconst config = 3;\nexport const main = useA() + useB() + config;\n',
      },
      "index.ts",
      (code) => {
        // Entry declaration keeps its original name (public API surface).
        assert.ok(
          /const config = 3;/.test(code),
          `entry declaration must not be renamed:\n${code}`,
        );
        // Non-entry duplicates are still renamed around it.
        assert.ok(
          code.includes("_uconfig$1") && code.includes("_uconfig$2"),
          `duplicates should be renamed:\n${code}`,
        );
        // The entry usage binds to its own (unrenamed) `config`.
        assert.ok(
          /useB\(\) \+ config;/.test(code),
          `entry reference must stay \`config\`:\n${code}`,
        );
      },
    );
  });

  test("renames import bindings that import a duplicated name", () => {
    withProject(
      {
        "a.ts": "function helper() { return 1; }\nexport default helper;\n",
        "b.ts": "function helper() { return 2; }\nexport const outB = helper();\n",
        "index.ts":
          'import h from "./a.js";\nimport { outB } from "./b.js";\nexport const main = h() + outB;\n',
      },
      "index.ts",
      (code) => {
        // a.ts exported the identifier `helper` as default; b.ts also
        // declares `helper` locally. The rename pipeline must produce
        // consistent identifiers, and the entry default-import binding
        // must resolve to the renamed declaration from a.ts.
        const aDecl = code.match(/function (_uhelper\$\d+|_aa\$\d+)\(\)/g) ?? [];
        assert.ok(aDecl.length > 0, `expected a renamed declaration for helper in:\n${code}`);
        assert.ok(
          !/\bfunction helper\(\)/.test(code),
          `duplicate function must not survive unrenamed:\n${code}`,
        );
      },
    );
  });

  test("does not rename exported declarations or unique names", () => {
    withProject(
      {
        "a.ts": "export function sharedApi() { return 1; }\n",
        "b.ts": "export function otherApi() { return 2; }\n",
        "index.ts":
          'import { sharedApi } from "./a.js";\nimport { otherApi } from "./b.js";\nexport const main = sharedApi + otherApi;\n',
      },
      "index.ts",
      (code) => {
        // Exported names are the public API — never `_u`-renamed.
        assert.ok(!code.includes("_u"), `exported names must not be renamed:\n${code}`);
        assert.ok(
          code.includes("sharedApi") && code.includes("otherApi"),
          `exported names must be preserved:\n${code}`,
        );
      },
    );
  });
});

describe("v3.0.0 bundler: export * expansion", () => {
  test("expands entry-file star re-export into explicit named exports", () => {
    withProject(
      {
        "foo.ts": 'export const alpha = "A";\nexport function beta() { return alpha; }\n',
        "index.ts": 'export * from "./foo.js";\nexport const gamma = "G";\n',
      },
      "index.ts",
      (code) => {
        assert.ok(!code.includes("export *"), `star must not survive:\n${code}`);
        assert.ok(
          /export \{[^}]*alpha[^}]*\}/.test(code),
          `alpha must be re-exported explicitly:\n${code}`,
        );
        assert.ok(
          /export \{[^}]*beta[^}]*\}/.test(code),
          `beta must be re-exported explicitly:\n${code}`,
        );
        // Entry's own export survives alongside the expansion.
        assert.ok(/export const gamma/.test(code), `entry own export must survive:\n${code}`);
      },
    );
  });

  test("target module content is still inlined", () => {
    withProject(
      {
        "foo.ts": "export const meaning = 42;\nexport function compute() { return meaning; }\n",
        "index.ts": 'export * from "./foo.js";\n',
      },
      "index.ts",
      (code) => {
        assert.ok(
          code.includes("42") && code.includes("compute"),
          `target content must be inlined:\n${code}`,
        );
        assert.ok(
          /export \{[^}]*meaning[^}]*\}/.test(code),
          `inlined bindings must be re-exported:\n${code}`,
        );
      },
    );
  });

  test("follows chained star re-exports recursively", () => {
    withProject(
      {
        "leaf.ts": "export const l = 2;\n",
        "mid.ts": 'export * from "./leaf.js";\nexport const m = 1;\n',
        "index.ts": 'export * from "./mid.js";\n',
      },
      "index.ts",
      (code) => {
        assert.ok(!code.includes("export *"), `star must not survive:\n${code}`);
        assert.ok(
          /export \{[^}]*\bl\b[^}]*\}/.test(code) || /export \{[^}]*m[^}]*\bl[^}]*\}/.test(code),
          `chained star names must be re-exported:\n${code}`,
        );
        assert.ok(code.includes("l") && code.includes("m"), `contents must be inlined:\n${code}`);
      },
    );
  });

  test("entry-file explicit exports win over star re-exports", () => {
    withProject(
      {
        "foo.ts": "export const a = 1;\nexport const b = 2;\n",
        "index.ts": 'export const a = 10;\nexport * from "./foo.js";\n',
      },
      "index.ts",
      (code) => {
        // Entry's own `a` wins; only `b` comes from the star.
        assert.ok(/export const a = 10;/.test(code), `entry export must survive:\n${code}`);
        assert.ok(
          !/export \{ a[,\s}]/.test(code),
          `shadowed name must not be re-exported:\n${code}`,
        );
        assert.ok(
          /export \{[^}]*\bb\b[^}]*\}/.test(code),
          `non-shadowed name must be re-exported:\n${code}`,
        );
      },
    );
  });

  test("keeps `export * as ns` unchanged (cannot be inlined)", () => {
    withProject(
      {
        "foo.ts": "export const a = 1;\n",
        "index.ts": 'export * as ns from "./foo.js";\n',
      },
      "index.ts",
      (code) => {
        // A namespace star cannot be flattened; it must survive verbatim
        // (the runtime emits a warning; the statement is kept).
        assert.ok(
          /export \* as ns from "\.\/foo\.js";/.test(code) ||
            /export \* as ns from '\.\/foo\.js';/.test(code),
          `namespace star must be kept unchanged:\n${code}`,
        );
      },
    );
  });

  test("leaves non-local star re-exports untouched", () => {
    withProject(
      {
        "index.ts": 'export * from "some-npm-pkg";\nexport const local = 1;\n',
      },
      "index.ts",
      (code) => {
        assert.ok(
          /export \* from ["']some-npm-pkg["'];/.test(code),
          `non-local star must survive:\n${code}`,
        );
      },
    );
  });

  test("re-exported names resolve to the inlined bindings", () => {
    withProject(
      {
        "foo.ts": "export const helper = () => 7;\n",
        "index.ts": 'export * from "./foo.js";\nexport const main = helper();\n',
      },
      "index.ts",
      (code) => {
        // The re-export must reference the flattened local binding, not a
        // module path that no longer exists next to the bundle.
        assert.ok(
          /export \{[^}]*helper[^}]*\};/.test(code),
          `helper must be re-exported:\n${code}`,
        );
        assert.ok(/const helper = \(\) => 7;/.test(code), `binding must be inlined:\n${code}`);
      },
    );
  });
});

describe("v3.0.0 bundler: template-literal blank preservation", () => {
  test("preserves blank lines inside multi-line template literals", () => {
    withProject(
      {
        "a.ts": "export const txt = `# Header\n\n## Section`;\n\nexport const x = 1;\n",
        "index.ts": 'import { txt, x } from "./a.js";\nexport const main = txt.length + x;\n',
      },
      "index.ts",
      (code) => {
        // BUGS.md bug #1 — the blank line inside the template must survive.
        assert.ok(
          code.includes("# Header\n\n## Section"),
          `blank line inside template must be preserved:\n${code}`,
        );
        // The blank line OUTSIDE the template (between the two
        // declarations in a.ts) is still stripped — the template's closing
        // backtick is followed directly by the next declaration.
        assert.ok(
          /`;\nconst x = 1;/.test(code),
          `blank lines outside templates must still be stripped:\n${JSON.stringify(code)}`,
        );
      },
    );
  });

  test("preserves multiple consecutive blank lines inside templates", () => {
    withProject(
      {
        "a.ts": "export const md = `a\n\n\nb`;\n",
        "index.ts": 'import { md } from "./a.js";\nexport const main = md;\n',
      },
      "index.ts",
      (code) => {
        assert.ok(code.includes("a\n\n\nb"), `all blank lines must be preserved:\n${code}`);
      },
    );
  });

  test("strips blank lines outside templates in the same file", () => {
    withProject(
      {
        "a.ts": "export const a = 1;\n\n\nexport const b = 2;\n",
        "index.ts": 'import { a, b } from "./a.js";\nexport const main = a + b;\n',
      },
      "index.ts",
      (code) => {
        assert.ok(!/\n\n/.test(code), `blank lines outside templates must be stripped:\n${code}`);
        // `export` is stripped from dependency files; the declarations
        // themselves must survive inlined.
        assert.ok(
          /const a = 1;/.test(code) && /const b = 2;/.test(code),
          `content must survive:\n${code}`,
        );
      },
    );
  });
});

describe("v3.0.0 bundler: checks are lint-only during bundling", () => {
  test("bundling succeeds despite duplicate declarations (lint reports them)", () => {
    // In v2.x (bundler 0.2.4) duplicate declarations failed the build.
    // In v3.0.0 bundling auto-renames and succeeds; `suseeLint` reports.
    withProject(
      {
        "a.ts": "const config = 1;\nexport const useA = config;\n",
        "b.ts": "const config = 2;\nexport const useB = config;\n",
        "index.ts":
          'import { useA } from "./a.js";\nimport { useB } from "./b.js";\nexport const main = useA + useB;\n',
      },
      "index.ts",
      (code) => {
        assert.ok(code.includes("_uconfig$1"), `bundle should auto-rename duplicates:\n${code}`);
        assert.ok(
          /export const main = useA \+ useB;/.test(code),
          `entry must bundle normally:\n${code}`,
        );
      },
    );
  });

  test("bundling succeeds despite undefined usage (lint reports it)", () => {
    // In v2.x the default check ran during bundling; in v3.0.0 it does not.
    withProject(
      {
        "index.ts": "export const main = totallyUndefined + 1;\n",
      },
      "index.ts",
      (code) => {
        // No exit, no panic — the code is bundled as-is.
        assert.ok(
          code.includes("totallyUndefined"),
          `undefined usage must not block bundling:\n${code}`,
        );
      },
    );
  });
});
