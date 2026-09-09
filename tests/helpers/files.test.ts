import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// The `files` namespace captures `root = process.cwd()` at import time.
// We must chdir to our temp dir BEFORE importing the module so that
// `root` points at our isolated workspace.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "susee-files-"));
const origCwd = process.cwd();
process.chdir(tmpDir);

// Now import — root will be tmpDir
const { files } = await import("../../src/helpers/files.js");

after(async () => {
  process.chdir(origCwd);
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

describe("files.resolvePath", () => {
  test("resolves relative to cwd", () => {
    const p = files.resolvePath("foo.txt");
    assert.equal(p, path.resolve(tmpDir, "foo.txt"));
  });
});

describe("files.relativePath", () => {
  test("returns path relative to cwd", () => {
    const rel = files.relativePath(path.join(tmpDir, "nested", "bar.txt"));
    assert.equal(rel, path.join("nested", "bar.txt"));
  });
});

describe("files.joinPath", () => {
  test("joins path segments", () => {
    assert.equal(files.joinPath("a", "b", "c"), path.join("a", "b", "c"));
  });
});

describe("files.existsPath", () => {
  test("returns false for non-existent file", () => {
    assert.equal(files.existsPath("nope.txt"), false);
  });

  test("returns true after file is created", async () => {
    const p = path.join(tmpDir, "exists.txt");
    await fs.promises.writeFile(p, "hi");
    assert.equal(files.existsPath("exists.txt"), true);
  });
});

describe("files.parentPath", () => {
  test("returns parent directory resolved", () => {
    const parent = files.parentPath("nested/deep/file.ts");
    assert.equal(parent, path.resolve(tmpDir, "nested/deep"));
  });
});

describe("files.writeFile / readFile", () => {
  test("writes and reads file content", async () => {
    await files.writeFile("hello.txt", "hello world");
    const read = await files.readFile("hello.txt");
    assert.equal(read.str, "hello world");
    assert.equal(read.bytes, "hello world".length);
  });

  test("writeFile creates parent directories", async () => {
    await files.writeFile("dir1/dir2/file.txt", "deep");
    assert.equal(files.existsPath("dir1/dir2/file.txt"), true);
    const read = await files.readFile("dir1/dir2/file.txt");
    assert.equal(read.str, "deep");
  });

  test("writeFile overwrites existing file", async () => {
    await files.writeFile("ow.txt", "first");
    await files.writeFile("ow.txt", "second");
    const read = await files.readFile("ow.txt");
    assert.equal(read.str, "second");
  });

  test("readFile on non-existent file triggers process exit (tested via subprocess)", async (t) => {
    // logError(..., true) calls a native process.exit which cannot be stubbed
    // in-process. We verify this behaviour in a subprocess instead.
    t.skip("native exit — covered by subprocess error-path test");
  });
});

describe("files.readJsonFile", () => {
  test("parses JSON content", async () => {
    await files.writeFile("data.json", JSON.stringify({ a: 1, b: [2, 3] }));
    const obj = await files.readJsonFile("data.json");
    assert.deepEqual(obj, { a: 1, b: [2, 3] });
  });
});

describe("files.createDirectory", () => {
  test("creates nested directories", async () => {
    await files.createDirectory("a/b/c");
    assert.equal(fs.existsSync(path.join(tmpDir, "a", "b", "c")), true);
  });

  test("is idempotent for existing directory", async () => {
    await files.createDirectory("x/y");
    // should not throw
    await files.createDirectory("x/y");
    assert.equal(fs.existsSync(path.join(tmpDir, "x", "y")), true);
  });
});

describe("files.deleteFile", () => {
  test("deletes an existing file", async () => {
    await files.writeFile("todelete.txt", "bye");
    await files.deleteFile("todelete.txt");
    assert.equal(files.existsPath("todelete.txt"), false);
  });

  test("does not throw for non-existent file", async () => {
    await files.deleteFile("ghost.txt");
  });
});

describe("files.clearFolder", () => {
  test("removes all contents of a folder", async () => {
    await files.writeFile("cf/a.txt", "1");
    await files.writeFile("cf/b.txt", "2");
    await files.writeFile("cf/sub/c.txt", "3");
    await files.clearFolder("cf");
    assert.equal(fs.existsSync(path.join(tmpDir, "cf", "a.txt")), false);
    assert.equal(fs.existsSync(path.join(tmpDir, "cf", "b.txt")), false);
    assert.equal(fs.existsSync(path.join(tmpDir, "cf", "sub", "c.txt")), false);
  });

  test("does not throw for non-existent folder", async () => {
    await files.clearFolder("nonexistent-folder");
  });
});