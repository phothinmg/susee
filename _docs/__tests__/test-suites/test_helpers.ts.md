<details>
<summary>Documentation Metadata (click to expand)</summary>

```json
{
  "doc_type": "file_overview",
  "file_path": "__tests__/test-suites/test_helpers.ts",
  "source_hash": "38ba8b2e9c41b06e0b92e19fc67804479eeeca89797a381e84bb839ae1140e58",
  "last_updated": "2026-04-22T22:27:52.856605+00:00",
  "tokens_used": 18986,
  "complexity_score": 2,
  "estimated_review_time_minutes": 10,
  "external_dependencies": []
}
```

</details>

[Documentation Home](../../README.md) > [__tests__](../README.md) > [test-suites](./README.md) > **test_helpers**

---

# test_helpers.ts

> **File:** `__tests__/test-suites/test_helpers.ts`

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

Implements small, focused test helpers exported for automated test suites. Async filesystem helpers: setupTempDir(name) creates a namespaced temp directory; readJson(path) reads and parses JSON; fileExists(path) checks existence. Test-run helpers spawn a child process running `tsx <file>` to assert exit codes and stdout/stderr (exitWithCodeOneAndMessage, exitWithCodeZeroAndMessage). A lightweight expect(entry) wrapper uses node:assert for basic assertions (hasOwn, isInstanceOf, hasLength). sortObject(obj) returns a new object with keys sorted. All helpers are stateless and designed to integrate with common test frameworks via done callbacks.

## Dependencies

### Internal Dependencies

| Module | Usage |
| --- | --- |
| `node:assert` | Used to make runtime assertions inside helper functions. The expect(entry: any) helper calls assert.fail / assert.ok / assert.strictEqual to enforce conditions; exitWithCodeOneAndMessage and exitWithCodeZeroAndMessage use assert to check child process results. |
| `node:child_process` | Imports the exec function via `import { exec } from "node:child_process"`. exec is used by exitWithCodeOneAndMessage(filePath: string, done: (result?: any) => void, message?: string) and exitWithCodeZeroAndMessage(filePath: string, done: (result?: any) => void, message?: string) to run `tsx ${filePath}` in a shell and inspect err, stdout, stderr for assertions. |
| [node:fs/promises](../node:fs/promises.md) | Default-imported as fs (`import fs from "node:fs/promises"`) and used for filesystem operations: fs.mkdtemp and fs.mkdir in setupTempDir(name: string); fs.readFile in readJson(filePath: string); fs.stat in fileExists(filePath: string). All usages are asynchronous (awaited). |
| `node:os` | Imported as os and used in setupTempDir(name: string) to obtain the system temporary directory via os.tmpdir() when constructing the namespaced temp path. |
| `node:path` | Imported as path and used in setupTempDir(name: string) to join os.tmpdir() with a prefix `susee-${name}-` as the template argument to fs.mkdtemp; ensures platform-correct path construction. |

## 📁 Directory

This file is part of the **test-suites** directory. View the [directory index](_docs/__tests__/test-suites/README.md) to see all files in this module.

## Architecture Notes

- All helpers are stateless exported functions intended for synchronous use inside test suites; they rely on Node.js standard library primitives (fs/promises, child_process, assert, os, path) and the external `tsx` CLI at runtime for executing TypeScript files.
- Child-process assertions rely on Node's Error.code property (numeric exit code) and on exact trimmed stdout/stderr strings when a message parameter is provided; the helpers call the provided done callback with an error if assertions fail to integrate with common test frameworks that accept async done callbacks.

## Usage Examples

### Run a TypeScript test script and assert it exits with code 1 and specific stderr

Call exitWithCodeOneAndMessage('./script.ts', done, 'expected error message') inside a test. The helper executes `tsx ./script.ts`, asserts the child process produced an Error with err.code === 1, that stderr.trim() equals the provided message, and that stdout is empty; it then invokes done() or done(err) on failure.

## Maintenance Notes

- The helpers call `tsx` via exec — ensure `tsx` is available on the test runtime PATH or adapt the command if a different runner is required.
- Expect helper uses `any` and includes biome-ignore lint comments in source; if stricter typing is needed, refactor expect and isObject to typed overloads.
- exitWithCode* helpers assert exact trimmed stdout/stderr contents when a message is provided; tests depending on partial or fuzzy matches should be adapted to compare substrings instead.

---

## Navigation

**↑ Parent Directory:** [Go up](_docs/__tests__/test-suites/README.md)

---

*This documentation was automatically generated by AI ([Woden DocBot](https://github.com/marketplace/ai-document-creator)) and may contain errors. It is the responsibility of the user to validate the accuracy and completeness of this documentation.*


---

## Functions and Classes


#### function expect

![Type: Sync](https://img.shields.io/badge/Type-Sync-green)

### Signature

```typescript
function expect(entry: any): { hasOwn: (input: any) => void; isInstanceOf: (input: any) => void; hasLength: (input: number) => void }
```

### Description

Creates and returns a small assertion helper object with methods to perform runtime checks against a captured entry.


Takes any value as entry and returns an object with three assertion helpers. hasOwn verifies the entry is an object and has a specific own property; isInstanceOf compares typeof for string names or uses instanceof for constructors; hasLength computes length (own enumerable keys for objects or .length for others) and asserts it meets a minimum.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `entry` | `any` | ✅ | Value under test; used by the returned assertion methods.
<br>**Constraints:** Can be any value; some methods (hasOwn, hasLength) expect object-like or length-bearing entries and will call assert.fail if expectations about type/shape are not met. |

### Returns

**Type:** `{ hasOwn: (input: any) => void; isInstanceOf: (input: any) => void; hasLength: (input: number) => void }`

An object containing three assertion methods that perform checks against the captured entry and use assert.ok/assert.fail to indicate success or failure.


**Possible Values:**

- An object with methods: { hasOwn, isInstanceOf, hasLength }

### Raises

| Exception | Condition |
| --- | --- |
| `AssertionError (via assert.fail / assert.ok)` | Raised when an assertion fails: e.g., hasOwn called when entry is not an object or property missing; isInstanceOf when type/instance check fails; hasLength when length cannot be determined or is less than the expected number. |

### Complexity

O(1) for creating the helper and for hasOwn/isInstanceOf checks; hasLength may be O(n) when entry is an object because Object.keys(entry).length enumerates own keys.

### Notes

- The helper relies on external assert.* functions to signal failures; those calls will throw or report according to the assert implementation in scope.
- hasLength treats objects by counting own enumerable keys and non-objects by reading .length if present; if length is falsy (0, undefined, null) it calls assert.fail and reports the typeof entry.
- isInstanceOf accepts either a string (compares typeof entry to that string) or a constructor/function (uses instanceof).

---



#### function exitWithCodeOneAndMessage

![Type: Async](https://img.shields.io/badge/Type-Async-blue)

### Signature

```typescript
function exitWithCodeOneAndMessage(filePath: string, done: (result?: any) => void, message?: string): void
```

### Description

Runs the given file with the `tsx` command and asserts that the spawned process exits with code 1, optional stderr message, and no stdout, then calls the provided callback with success or error.


Runs the given file using Node's exec to invoke `tsx` and inspects the exec callback. It asserts that the process produced an Error with code 1, that stdout is empty, and—if an expected message is provided—that stderr.trim() equals it. Any assertion or other error is caught and passed to the done callback.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `filePath` | `string` | ✅ | Filesystem path to the script to execute with `tsx`.
<br>**Constraints:** Should be a valid path to an executable TypeScript/JavaScript file accessible from the test runtime, May contain spaces or special characters; it is interpolated into a shell command via template string |
| `done` | `(result?: any) => void` | ✅ | Callback invoked when the assertions complete. Called with no arguments on success or with an Error on failure.
<br>**Constraints:** Must be a function accepting an optional result/error argument |
| `message` = `undefined` | `string | undefined` | ❌ | Optional expected stderr message; when provided, stderr.trim() must strictly equal this string.
<br>**Constraints:** If provided, comparison is exact after applying String.prototype.trim() to stderr |

### Returns

**Type:** `void`

Does not return a value synchronously; completion is signaled via the done callback (done() on success, done(err) on failure).


**Possible Values:**

- Calls done() with no arguments if assertions pass
- Calls done(err) where err is the thrown AssertionError or other Error if assertions fail or another error occurs

### Raises

| Exception | Condition |
| --- | --- |
| `AssertionError (from assert.*)` | Raised if any assertion fails inside the exec callback (e.g., err is not an Error, err.code !== 1, stdout not empty, or stderr mismatch). Note: this exception is caught and passed to done(err) within the function. |

### Side Effects

> ❗ **IMPORTANT**
> This function has side effects that modify state or perform I/O operations.

- Spawns a child process / executes a shell command using exec(`tsx ${filePath}`)
- Invokes the provided done callback (done() or done(err))
- Reads stdout and stderr produced by the child process and performs assertions

### Usage Examples

#### Verify a script exits with code 1 and emits a specific stderr message

```typescript
exitWithCodeOneAndMessage('./scripts/failing-script.ts', done, 'Expected error message')
```

Executes the script with tsx and asserts the process exited with code 1, that stderr equals the provided message (after trimming), and that stdout is empty; calls done() if successful or done(err) on failure.

### Complexity

O(1)

### Notes

- Relies on Node.js convention of setting exit code on the Error object accessible as err.code from exec callback.
- Uses string interpolation to build the shell command; filenames with shell-sensitive characters may require escaping in callers.
- All assertion failures are caught and forwarded to the done callback rather than being thrown out of the exec callback.

---



#### function exitWithCodeZeroAndMessage

![Type: Sync](https://img.shields.io/badge/Type-Sync-green)

### Signature

```typescript
function exitWithCodeZeroAndMessage(filePath: string, done: (result?: any) => void, message?: string): void
```

### Description

Runs `tsx <filePath>` in a child process, asserts it exited with code 0, that stderr is empty, and optionally that stdout equals a provided message; calls done() on success or done(err) on failure.


The function uses child_process.exec to run `tsx` on the provided file path. Inside the exec callback it asserts that the error object is null (indicating exit code 0), that stderr is empty, and if a message is provided, that stdout trimmed equals that message; on success it calls done() and on assertion failure it calls done(err) with the caught error.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `filePath` | `string` | ✅ | Path to the file to execute with the `tsx` runtime.
<br>**Constraints:** Should be a valid executable TypeScript/JavaScript file path recognizable by `tsx`, Must be provided as a non-empty string for meaningful execution |
| `done` | `(result?: any) => void` | ✅ | Callback invoked after assertions complete; called with no arguments on success or with an Error (or other value) on failure.
<br>**Constraints:** Must be a callable function accepting zero or one argument |
| `message` = `undefined` | `string | undefined` | ❌ | Optional expected stdout content; if provided the function asserts that stdout.trim() strictly equals this string.
<br>**Constraints:** If provided, comparison uses strict equality against stdout.trim(), Comparison is exact and whitespace differences are trimmed from stdout only |

### Returns

**Type:** `void`

This function does not return a value; it communicates result via the provided done callback.


**Possible Values:**

- undefined (no return)
- Completion is indicated by calling done() on success or done(err) on failure

### Side Effects

> ❗ **IMPORTANT**
> This function has side effects that modify state or perform I/O operations.

- Spawns a child process by invoking the shell command `tsx <filePath>` via child_process.exec
- Reads the spawned process' stdout and stderr
- Invokes the provided callback `done` with either no argument (success) or an error argument (failure)

### Usage Examples

#### Use in a test to assert a script exits successfully and prints a specific message

```typescript
exitWithCodeZeroAndMessage('./dist/script.js', (err?) => { if (err) throw err; done(); }, 'Success')
```

Runs ./dist/script.js with tsx, asserts exit code is 0, stdout equals 'Success', stderr is empty, and calls the provided callback accordingly.

### Complexity

O(1)

### Related Functions

- `exec` - Calls - child_process.exec is used to spawn the process
- `assert.strictEqual` - Calls - used to perform the equality assertions on err, stdout, and stderr

### Notes

- Assertions (assert.strictEqual) are wrapped in a try/catch; assertion failures are passed to done(err) rather than thrown to the caller.
- stdout is trimmed before comparison; message is not trimmed before comparison.
- The command executed is a shell command string `tsx <filePath>`; shell interpretation applies (spaces in filePath may require quoting).
- The function relies on `tsx` being available in the environment where tests run.

---



#### function sortObject

![Type: Sync](https://img.shields.io/badge/Type-Sync-green)

### Signature

```typescript
function sortObject(obj: any)
```

### Description

Returns a new plain object whose own enumerable string-keyed properties are sorted by key in locale order.


The function obtains the entries (key/value pairs) of the provided object using Object.entries, sorts those entries by their keys using String.prototype.localeCompare, and then reconstructs an object from the sorted entries with Object.fromEntries. The original input object is not mutated; a new object is created and returned.

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `obj` | `any` | ✅ | The input value whose enumerable string-keyed properties will be read and sorted by key. Typically a plain object.
<br>**Constraints:** Must be coercible to an Object (i.e., not null or undefined) or Object.entries will throw, Only enumerable string-keyed own properties are considered; symbol-keyed properties are not included |

### Returns

**Type:** `any`

A new object constructed from the sorted entries of the input. Keys are in locale-sorted order; values are the corresponding original values.


**Possible Values:**

- An object with the same key/value pairs as the input but with keys ordered according to localeCompare
- If the input has no enumerable string-keyed properties, an empty object {} is returned

### Raises

| Exception | Condition |
| --- | --- |
| `TypeError` | If obj is null or undefined, Object.entries(obj) will throw a TypeError (cannot convert undefined or null to object) |

### Complexity

O(n log n) time due to sorting; O(n) additional space for entries and the returned object

### Notes

- The function uses localeCompare for key comparison, which is locale-aware and may be slower than simple lexicographic comparison.
- Symbol-keyed properties and non-enumerable properties are ignored because Object.entries only returns enumerable string-keyed own properties.
- The result is a plain object; JavaScript objects do not guarantee iteration order in all contexts, though modern engines preserve insertion order for string keys.

---


