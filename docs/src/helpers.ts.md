# src/helpers.ts

## Overview ✨

This module provides **file-system utilities** and a simple **delay** function for build scripts and tooling. It wraps TypeScript’s `ts.sys` methods and Node’s `fs/promises` to offer:

- Path resolution and existence checks
- File reading, writing, deletion, and directory creation
- Recursive folder clearing
- A Promise-based delay

These helpers streamline repetitive I/O tasks in build pipelines or code generators.

---

## Core Utilities

| Function | Signature | Description |
| --- | --- | --- |
| **wait** ⏱️ | `(time: number) => Promise<void>` | Delays execution for given milliseconds. |
| **writeOutFile** | `(filePath: string, content: string) => void` | Writes `content` to `filePath`, recreating directories and deleting existing files. |
| **getEntryPath** | `(entry: string) => string` | Strips leading dots (`.`/`..`) from import-like paths. |
| **clearFolder** | `(folderPath: string) => Promise<void>` | Recursively removes all entries in `folderPath`. |
| **readFile** | `ts.sys.readFile` | Reads a file as UTF-8 text (re-export). |
| **resolvePath** | `ts.sys.resolvePath` | Resolves file paths (re-export). |


---

## 1. wait ⏱️

A simple asynchronous pause. Useful for rate-limiting or waiting for external processes.

```ts
import { wait } from "./helpers";

// Pause 500ms before proceeding
await wait(500);
```

- **Parameter**
- `time`
- Type: `number`
- Description: Delay duration in milliseconds.
- **Returns**
- `Promise<void>`

---

## 2. writeOutFile 💾

Writes text content to a file, ensuring the directory exists and replacing any existing file.

```ts
import { writeOutFile } from "./helpers";

writeOutFile("dist/index.js", "console.log('Built!');");
```

**Behavior Breakdown:**

1. **Resolve Path**
2. Uses `ts.sys.resolvePath` for consistent normalization.
3. **Delete Existing File**
4. If file exists and `deleteFile` is available, removes it.
5. **Ensure Directory**
6. Checks `directoryExists`; if missing, calls `createDirectory`.
7. **Write File**
8. Calls `ts.sys.writeFile` with the final path and content.

---

## 3. getEntryPath 🛣️

Cleans up module-style paths by removing leading `.` segments.

```ts
getEntryPath("../../src/helpers.ts"); // returns "src/helpers.ts"
getEntryPath("utils/file");            // returns "utils/file"
```

- **Parameter**
- `entry`
- Type: `string`
- Description: A path that may start with `.` or `..`.
- **Returns**
- `string` — the trimmed path without leading dots.

---

## 4. clearFolder 🧹

Empties a directory’s contents without deleting the directory itself.

```ts
await clearFolder("temp");
// All files and subfolders in /current/working/dir/temp are removed.
```

- **Parameter**
- `folderPath`
- Type: `string`
- Description: Relative or absolute path to target folder.
- **Returns**
- `Promise<void>`
- **Details**
- Resolves the path via `path.resolve(process.cwd(), …)`.
- Uses `fs.promises.readdir` and `fs.promises.rm` (recursive).
- Ignores non-existence errors (`ENOENT`); rethrows others.

---

## Under the Hood 🛠️

This helper module leverages:

- **TypeScript System (ts.sys)**
- `resolvePath`, `fileExists`, `deleteFile`, `directoryExists`, `createDirectory`, `writeFile`, `readFile`
- **Node.js**
- `fs.promises` for async folder operations
- `path` for cross-platform path handling

By combining TypeScript’s built-in I/O with Node’s Promise API, these functions ensure consistent behavior across environments.

---

## Exported API

```ts
export {
  wait,
  writeOutFile,
  readFile,
  resolvePath,
  getEntryPath,
  clearFolder,
};
```

Use these exports to handle file-system tasks in build tools, code generators, or CLI utilities with minimal boilerplate.