<details>
<summary>Documentation Metadata (click to expand)</summary>

```json
{
  "doc_type": "file_overview",
  "file_path": "src/cli/index.ts",
  "source_hash": "57dc3aab83cb6378c3439e08d4f435ef645109b1955cb1e93c750d53a48268fb",
  "last_updated": "2026-04-22T22:30:32.249649+00:00",
  "git_sha": "43887b26212a35463770c5ecb1eb33fba9712ef9",
  "tokens_used": 6837,
  "complexity_score": 3,
  "estimated_review_time_minutes": 10,
  "external_dependencies": [
    "@suseejs/color"
  ]
}
```

</details>

[Documentation Home](../../README.md) > [src](../README.md) > [cli](./README.md) > **index**

---

# index.ts

> **File:** `src/cli/index.ts`

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

This file implements the top-level CLI orchestration for the Susee tool. On import it runs an async main function (suseeCliBuild) that reads process.argv, decides whether to run a default build, show help, run an initialization flow, or execute a build with parsed options and then delegates to helper modules (cliBuild, cliCompiler).

It also contains a small interactive initializer (cliInit) that prompts the user whether the project is TypeScript, chooses an appropriate config filename (susee.config.ts, susee.config.js, or susee.config.mjs), uses getPackageType to detect package type, and writes a template config file to the current working directory. Error paths call process.exit(1) and unhandled rejections are caught and printed before exiting.

## Dependencies

### External Dependencies

| Module | Usage |
| --- | --- |
| `@suseejs/color` | Third-party color helper used to color console output. The code calls tcolor.cyan(...) to color the prompt and informational messages printed to console. |

### Internal Dependencies

| Module | Usage |
| --- | --- |
| `node:fs` | Used for filesystem operations: fs.existsSync checks whether a config file already exists; fs.promises.readFile is used in getPackageType to read package.json; fs.promises.unlink removes an existing config file before creating a new one; fs.promises.writeFile writes the generated config template to disk. |
| `node:path` | Used to build absolute paths with path.resolve(process.cwd(), <filename>) for package.json and the generated susee config file paths. |
| `node:process` | Used to access the current working directory (process.cwd()), CLI arguments (process.argv), and to terminate the process (process.exit) on error conditions. |
| [node:readline/promises](../node:readline/promises.md) | Provides an async readline Interface: createInterface is called to prompt the user in cliInit, and its question method is used to get the 'Is TypeScript project(y/n)' response. |
| [./build.js](.././build.js.md) | Internal module; imports cliBuild which is invoked when the CLI is run with no arguments (susee -> cliBuild()). |
| [./cli.js](.././cli.js.md) | Internal module; imports cliCompiler and calls cliCompiler.compile(options) when 'susee build' is invoked with additional arguments parsed into options. |
| [./lib/parse_argv.js](.././lib/parse_argv.js.md) | Internal module; imports parseArgs to convert raw CLI tokens into a parsed representation, and getDefaultOptions to produce the final options object passed to cliCompiler.compile(options). |
| [./lib/print_help.js](.././lib/print_help.js.md) | Internal module; imports printHelp and calls it when '--help' or '-h' is requested or in certain single-argument flows to display usage information. |

## 📁 Directory

This file is part of the **cli** directory. View the [directory index](_docs/src/cli/README.md) to see all files in this module.

## Architecture Notes

- Single-file CLI entrypoint that immediately runs an async main (suseeCliBuild) at module load; this file is imperative and uses process.exit to terminate on errors.
- Delegates actual build and compile work to internal modules (cliBuild, cliCompiler) and delegates arg parsing to a dedicated parse_argv helper, keeping this layer focused on dispatch and minimal I/O.
- The initializer (cliInit) constructs template config text constants for TypeScript and JavaScript and writes them to the project root; it relies on package.json detection to choose JS module naming.

## Usage Examples

### Default build (no CLI args)

Run the tool with no arguments (node ./bin/susee or susee). The file calls cliBuild() from ./build.js to perform the default build workflow.

### Create starter config

Run 'susee init'. The CLI prompts 'Is TypeScript project(y/n)' and writes one of susee.config.ts, susee.config.js, or susee.config.mjs to the current working directory using the internal template strings.

### Build with options

Run 'susee build <args>'. The file calls parseArgs(...) then getDefaultOptions(...) to produce an options object and invokes cliCompiler.compile(options) to run a build with the parsed options.

## Maintenance Notes

- The module performs file I/O without explicit existence checks for package.json in getPackageType: reading package.json will throw if it doesn't exist; consider handling that error for clearer messages.
- cliInit will overwrite an existing config file: it unlinks the existing file if present before writing the new template—be cautious when running in projects with existing susee config files.
- Because suseeCliBuild runs immediately and uses process.exit on error, importing this module in other code will trigger CLI execution and may exit the host process; treat it as an executable entrypoint only.

---

## Navigation

**↑ Parent Directory:** [Go up](_docs/src/cli/README.md)

---

*This documentation was automatically generated by AI ([Woden DocBot](https://github.com/marketplace/ai-document-creator)) and may contain errors. It is the responsibility of the user to validate the accuracy and completeness of this documentation.*
