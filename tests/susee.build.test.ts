import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import susee from "../src/index.ts";

/**
 * Sets up a temporary project directory with a minimal project structure.
 *
 * The generated project directory contains a `src` folder with `util.ts` and `index.ts` files.
 * The `package.json` file is also written with a default module type.
 *
 * @returns The path to the temporary project directory.
 */
async function setupProject() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "susee-test-"));
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "package.json"),
    JSON.stringify(
      {
        name: "tmp-susee",
        version: "0.0.0",
        type: "module",
      },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(tmpDir, "src", "util.ts"),
    "export const add = (a: number, b: number) => a + b;\n",
  );
  await fs.writeFile(
    path.join(tmpDir, "src", "index.ts"),
    "import { add } from './util';\nexport default function sum(a: number, b: number) {\n  return add(a, b);\n}\n",
  );
  return tmpDir;
}

async function readJson(filePath: string) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function fileExists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("Susee Tests", () => {
  it("susee.build emits both CJS and ESM outputs", async () => {
    const cwd = process.cwd();
    const tmpDir = await setupProject();
    process.chdir(tmpDir);
    try {
      await susee.build({
        entry: "src/index.ts",
        outDir: "dist",
        defaultExportName: "sum",
        target: "both",
      });

      assert.equal(
        await fileExists(path.join(tmpDir, "dist", "index.cjs")),
        true,
      );
      assert.equal(
        await fileExists(path.join(tmpDir, "dist", "index.d.cts")),
        true,
      );
      assert.equal(
        await fileExists(path.join(tmpDir, "dist", "index.mjs")),
        true,
      );
      assert.equal(
        await fileExists(path.join(tmpDir, "dist", "index.d.mts")),
        true,
      );

      const pkg = await readJson(path.join(tmpDir, "package.json"));
      assert.equal(pkg.type, "module");
      assert.ok(pkg.exports["."]?.import);
      assert.ok(pkg.exports["."]?.require);
    } finally {
      process.chdir(cwd);
    }
  });
  it("susee.build respects commonjs target", async () => {
    const cwd = process.cwd();
    const tmpDir = await setupProject();
    process.chdir(tmpDir);
    try {
      await susee.build({
        entry: "src/index.ts",
        outDir: "dist",
        defaultExportName: "sum",
        target: "commonjs",
      });

      assert.equal(
        await fileExists(path.join(tmpDir, "dist", "index.cjs")),
        true,
      );
      assert.equal(
        await fileExists(path.join(tmpDir, "dist", "index.d.cts")),
        true,
      );
      assert.equal(
        await fileExists(path.join(tmpDir, "dist", "index.mjs")),
        false,
      );

      const pkg = await readJson(path.join(tmpDir, "package.json"));
      assert.equal(pkg.type, "commonjs");
      assert.ok(pkg.exports["."]?.require);
      assert.equal(pkg.exports["."]?.import, undefined);
    } finally {
      process.chdir(cwd);
    }
  });

  it("susee.build applies post-process hooks", async () => {
    const cwd = process.cwd();
    const tmpDir = await setupProject();
    process.chdir(tmpDir);
    try {
      const hook = {
        async: false as const,
        func: (code: string) => `${code}\n// hook-applied`,
      };

      await susee.build({
        entry: "src/index.ts",
        outDir: "dist",
        defaultExportName: "sum",
        target: "commonjs",
        hooks: [hook],
      });

      const cjs = await fs.readFile(
        path.join(tmpDir, "dist", "index.cjs"),
        "utf8",
      );
      assert.ok(cjs.includes("// hook-applied"));
    } finally {
      process.chdir(cwd);
    }
  });

  it("susee.build adds subpath exports when isMainExport is false", async () => {
    const cwd = process.cwd();
    const tmpDir = await setupProject();
    process.chdir(tmpDir);
    try {
      await fs.mkdir(path.join(tmpDir, "dist"), { recursive: true });

      await susee.build({
        entry: "src/index.ts",
        outDir: "dist/extra",
        defaultExportName: "sum",
        isMainExport: false,
      });

      const pkg = await readJson(path.join(tmpDir, "package.json"));
      assert.ok(pkg.exports["./extra"]);
    } finally {
      process.chdir(cwd);
    }
  });
});
