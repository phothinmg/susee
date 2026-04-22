<details>
<summary>Documentation Metadata (click to expand)</summary>

```json
{
  "doc_type": "file_overview",
  "file_path": "__tests__/test-suites/cli/cli.integration.test.ts",
  "source_hash": "cbb2b9043fea480d2ff996422377a9789e2b8a894f83c872da66ccbfb6d17473",
  "last_updated": "2026-04-22T22:21:46.754694+00:00",
  "tokens_used": 8443,
  "complexity_score": 3,
  "estimated_review_time_minutes": 10,
  "external_dependencies": []
}
```

</details>

[Documentation Home](../../../README.md) > [__tests__](../../README.md) > [test-suites](../README.md) > [cli](./README.md) > **cli.integration.test**

---

# cli.integration.test.ts

> **File:** `__tests__/test-suites/cli/cli.integration.test.ts`

![Complexity: Low](https://img.shields.io/badge/Complexity-Low-green) ![Review Time: 10min](https://img.shields.io/badge/Review_Time-10min-blue)

## 📑 Table of Contents


- [Overview](#overview)
- [Dependencies](#dependencies)
- [Architecture Notes](#architecture-notes)
- [Usage Examples](#usage-examples)
- [Maintenance Notes](#maintenance-notes)
- [Functions and Classes](#functions-and-classes)

---

## Overview

This Node.js/TypeScript test module uses the built-in node:test API to run integration tests against the project's CLI entry (src/cli/index.ts). It spawns the real CLI with 'npx tsx' in isolated temporary directories, captures stdout/stderr/exit codes, and asserts behavior for help, init, and build flows. Helper utilities create minimal project files (package.json, tsconfig.json, src/index.ts) and verify generated artifacts to validate end-to-end CLI behavior.

## Dependencies

### Internal Dependencies

| Module | Usage |
| --- | --- |
| `node:assert` | Provides assertion functions used across tests (assert.strictEqual, assert.match) to validate CLI exit codes, stdout/stderr contents, and file existence checks. |
| `node:child_process` | The named import 'spawn' is used by runCli(...) to start a child process: spawn('npx', ['tsx', cliEntry, ...args], { cwd, stdio: 'pipe' }). The child process is used to execute the TypeScript CLI entry and capture stdout/stderr and exit code. |
| [node:fs/promises](../node:fs/promises.md) | Imported as fs and used for asynchronous filesystem operations in tests and helpers: mkdir(...), writeFile(...) to create package.json, src/index.ts, tsconfig.json, and susee.config.* files inside temporary directories. |
| `node:path` | Used for building file system paths (path.resolve, path.join) including computing the CLI entry path and target file paths to assert results (e.g., path.join(cwd, 'dist', 'index.mjs')). |
| `node:test` | Provides the test runner functions 'describe' and 'it' used to declare test suites and test cases. The file uses these to structure and execute the integration tests. |
| [../test_helpers.js](../../test_helpers.js.md) | Project-local test helper module providing setupTempDir(...) to create isolated temporary directories for each test and fileExists(...) to check for presence of generated files. Used throughout the tests to prepare per-case working directories and assert artifacts. |

## 📁 Directory

This file is part of the **cli** directory. View the [directory index](_docs/__tests__/test-suites/cli/README.md) to see all files in this module.

## Architecture Notes

- Tests run the actual CLI entry (src/cli/index.ts) in a child process via 'npx tsx' rather than importing the CLI directly, ensuring the runtime behavior, module resolution, and process-level exit codes are validated.
- Each test runs in an isolated temporary directory (setupTempDir) and often writes minimal project files (package.json, tsconfig.json, src/index.ts) to simulate different project types and to verify file outputs without affecting the repository.
- The test suite captures stdout/stderr independently and checks both textual output (help messages, creation confirmations, error messages) and side-effect artifacts (generated config files and compiled assets in dist/outdir).

## Usage Examples

### Execute the integration tests locally

Run the test file using Node's test runner (e.g., node --test __tests__/test-suites/cli/cli.integration.test.ts or the project's npm test script). The test harness will spawn 'npx tsx <project-root>/src/cli/index.ts' for each test case, so ensure 'tsx' is available via npx and the project has the CLI entry at src/cli/index.ts.

## Maintenance Notes

- The tests expect 'npx tsx' to be available in the environment. If tsx is not installed globally or resolvable via npx, the runCli helper will fail to spawn the child process.
- Tests rely on Node's built-in 'node:test' API (describe/it); ensure running on a Node version that includes node:test (Node 18+).
- The test suite uses process.cwd() to resolve the CLI entry (src/cli/index.ts). Moving or renaming the CLI entry requires updating the runCli helper or ensuring the file is available at that path.

---

## Navigation

**↑ Parent Directory:** [Go up](_docs/__tests__/test-suites/cli/README.md)

---

*This documentation was automatically generated by AI ([Woden DocBot](https://github.com/marketplace/ai-document-creator)) and may contain errors. It is the responsibility of the user to validate the accuracy and completeness of this documentation.*


---

## Functions and Classes


#### function runCli

![Type: Async](https://img.shields.io/badge/Type-Async-blue)

### Signature

```typescript
function runCli(args: string[], cwd: string, input = ""): Promise<CliResult>
```

### Description

Starts a child process that runs the project's CLI entry via `npx tsx` with the provided arguments and working directory, capturing stdout, stderr, and the exit code, and returns those in a Promise.


Resolves the project's CLI entry path relative to cwd, then spawns a child process using 'npx tsx <entry> ...args' with stdio piped. It accumulates stdout and stderr, optionally writes input to stdin and ends it, and returns a Promise that resolves to { code, stdout, stderr } when the process closes. If the child emits an 'error' event the Promise is rejected.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `args` | `string[]` | ✅ | Array of command-line arguments to pass to the CLI entry.
<br>**Constraints:** Elements must be strings |
| `cwd` | `string` | ✅ | Working directory to run the spawned process in (passed to spawn as cwd).
<br>**Constraints:** Must be a valid filesystem path string |
| `input` = `""` | `string` | ❌ | Optional string to write to the child process's stdin before ending it.
<br>**Constraints:** If empty string, nothing is written to stdin, A non-empty string is written once to stdin before ending |

### Returns

**Type:** `Promise<CliResult>`

A Promise that resolves when the child process closes; the resolved object contains the process exit code and the collected stdout and stderr strings.


**Possible Values:**

- { code: number | null, stdout: string, stderr: string }

### Raises

| Exception | Condition |
| --- | --- |
| `Error` | If the spawned child process emits an 'error' event, the Promise is rejected with that error. |

### Side Effects

> ❗ **IMPORTANT**
> This function has side effects that modify state or perform I/O operations.

- Spawns an external child process via 'npx' running 'tsx' with the resolved CLI entry
- Reads from the child process's stdout and stderr streams (accumulates data)
- Writes to the child process's stdin (if input is non-empty) and ends stdin
- Uses process.cwd() and path.resolve to compute the CLI entry path

### Usage Examples

#### Run the CLI with arguments and capture its output in an integration test

```typescript
await runCli(['--version'], '/path/to/project');
```

Demonstrates calling runCli to execute the project's CLI from a specific working directory with arguments; resolves to an object with code, stdout, and stderr.

### Complexity

O(1)

### Notes

- The resolved code value is forwarded directly from the child 'close' event and can be number or null (per Node child process behavior).
- stdin is always ended by this function (child.stdin.end() is called regardless of whether input was written).
- The function uses 'npx tsx <entry>' to run the TypeScript entry file at runtime; behavior depends on environment having npx and tsx available.

---


