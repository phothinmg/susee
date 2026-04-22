<details>
<summary>Documentation Metadata (click to expand)</summary>

```json
{
  "doc_type": "file_overview",
  "file_path": "build.ts",
  "source_hash": "f860b3a8759b0eeb9403017bf1b79023122467affd5430eab8bcc9d1598d611c",
  "last_updated": "2026-04-22T22:29:08.479615+00:00",
  "git_sha": "24451ed4376c5ebc7bc9f34aca9a3db427b8f7db",
  "tokens_used": 4609,
  "complexity_score": 3,
  "estimated_review_time_minutes": 10,
  "external_dependencies": [
    "@suseejs/files",
    "@suseejs/terser-plugin",
    "@suseejs/banner-text-plugin"
  ]
}
```

</details>

[Documentation Home](README.md) > **build**

---

# build.ts

> **File:** `build.ts`

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

This TypeScript script performs a two-phase build. First it calls an internal build(...) helper to compile the library entry (src/index.ts) into dist with ESM and CJS outputs, applying a banner-text plugin and a terser plugin, and allowing package.json updates.

After the library build, the script runs an external CLI bundling command (cliCommand) via child_process.exec to produce dist/bin/index.mjs. On success it ensures the compiled CLI has a node shebang, sets executable permissions (chmod 0o755) on the compiled CLI and a small wrapper written to bin/suse, and sequences these steps using a Promise wrapper around exec and top-level await.

## Dependencies

### External Dependencies

| Module | Usage |
| --- | --- |
| `@suseejs/files` | import { files } from "@suseejs/files"; files.writeFile(bf, content) is called in writeBinary() to create the lightweight wrapper file at bin/suse whose content imports the compiled CLI module. |
| `@suseejs/terser-plugin` | import { suseeTerser } from "@suseejs/terser-plugin"; suseeTerser is included directly in the plugins array passed to build(...) to perform minification/terser transformations during the library build. |
| `@suseejs/banner-text-plugin` | import { suseeBannerText } from "@suseejs/banner-text-plugin"; suseeBannerText(bannerText) is called to create a banner-text plugin instance (bannerText constant) which is included in the plugins array passed to build(...). |

### Internal Dependencies

| Module | Usage |
| --- | --- |
| `node:child_process` | import { exec } from "node:child_process"; exec(cliCommand, async (error) => { ... }) is used to run an external CLI bundling command (the string in cliCommand) and the callback drives post-build steps (grantCli, chmod, writeBinary) or rejects on error. |
| `node:fs` | import fs from "node:fs"; fs.existsSync(...) is used to check presence of dist/bin/index.mjs; fs.promises.readFile(...) and fs.promises.writeFile(...) are used inside grantCli to inspect and prepend the shebang if missing; fs.promises.chmod(...) is used to set executable permissions on built files. |
| `node:path` | import path from "node:path"; path.resolve(process.cwd(), ef) and similar are used to compute absolute paths for the compiled CLI file (ef) and the wrapper binary (bf) prior to reading/writing/chmod operations. |
| [./src/index.js](.././src/index.js.md) | import { build } from "./src/index.js"; the build(...) function is invoked with an entryPoints array, plugins (suseeBannerText(bannerText), suseeTerser), allowUpdatePackageJson: true, and outDir: "dist" to produce the library outputs. |

## 📁 Directory

This file is part of the **_docs** directory. View the [directory index](_docs/README.md) to see all files in this module.

## Architecture Notes

- Two-phase build: internal build(...) compiles the library with plugins, then a separate CLI bundling step is executed via child_process.exec to produce dist/bin outputs.
- Filesystem and permission management: script ensures the compiled CLI has a node shebang and sets executable bit (0o755) on both the compiled CLI (dist/bin/index.mjs) and the wrapper (bin/suse).
- Top-level await + Promise wrapper: uses top-level await for sequential async flow and wraps exec in a Promise to convert callback-style completion into async/await-compatible control flow.

## Usage Examples

### Main use case

Run this script as part of the package build/publish step to produce library artifacts in dist and an executable CLI. The script executes build(...) to emit dist artifacts, runs the external tsx-based CLI bundle command to produce dist/bin/index.mjs, ensures the shebang is present, writes a small bin/suse wrapper that imports the compiled CLI, and sets chmod 755 on both files.

## Maintenance Notes

- Top-level await requires a Node.js environment that supports ES modules and top-level await; ensure the runtime used to run this .ts file supports those features or run via tsx/ts-node that supports top-level await.
- The CLI bundling step relies on the external tool 'npx tsx' being available and the exact cliCommand string; changes to the CLI build tool or arguments will require updating cliCommand.
- Paths ef ("dist/bin/index.mjs") and bf ("bin/suse") are hard-coded; if build output locations change, update these constants and related chmod/write logic.

---

## Navigation

**↑ Parent Directory:** [Go up](_docs/README.md)

---

*This documentation was automatically generated by AI ([Woden DocBot](https://github.com/marketplace/ai-document-creator)) and may contain errors. It is the responsibility of the user to validate the accuracy and completeness of this documentation.*
