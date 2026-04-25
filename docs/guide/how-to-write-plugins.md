# How to Write Plugins

This guide shows how to create plugins for Susee and wire them into your `susee.config.ts`.

If you want the conceptual overview of plugin categories and execution order, read [Plugin Types and Lifecycle](/guide/plugin-types-lifecycle).

## 1. Pick the right plugin type

Choose your plugin type based on when your logic should run:

- `dependency`: transform dependency file objects before merge
- `pre-process`: transform merged source code before compile
- `post-process`: transform compiled output before write

## 2. Understand the plugin shape

A plugin can be:

- An object
- A factory function that returns an object

Each plugin must include:

- `type`
- `async` (`true` or `false`)
- `func`

Optional field:

- `name`

## 3. Write your first plugin

### Example A: simple `pre-process` plugin (sync)

```ts
const addBannerPlugin = {
  name: "add-banner",
  type: "pre-process" as const,
  async: false,
  func(code: string, file?: string) {
    const target = file ?? "unknown";
    return `/* bundled from: ${target} */\n${code}`;
  },
};
```

### Example B: `post-process` plugin (async)

```ts
const replaceBuildFlagPlugin = {
  name: "replace-build-flag",
  type: "post-process" as const,
  async: true,
  async func(code: string) {
    return code.replaceAll("__BUILD_FLAG__", "true");
  },
};
```

### Example C: `dependency` plugin (sync)

```ts
import type ts from "typescript";
import type { DepsFiles } from "@suseejs/type";

const trimDependencyCodePlugin = {
  name: "trim-dependency-code",
  type: "dependency" as const,
  async: false,
  func(depsFiles: DepsFiles, _compilerOptions: ts.CompilerOptions): DepsFiles {
    return depsFiles.map((dep) => ({
      ...dep,
      content: dep.content.trim(),
    }));
  },
};
```

## 4. Register plugins in config

```ts
import type { SuSeeConfig } from "susee";

const addBannerPlugin = {
  name: "add-banner",
  type: "pre-process" as const,
  async: false,
  func(code: string) {
    return `/* package build */\n${code}`;
  },
};

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
      plugins: [addBannerPlugin],
    },
  ],
};

export default config;
```

## 5. Use factory plugins when configurable behavior is needed

```ts
function createTagPlugin(tag: string) {
  return {
    name: "tag-plugin",
    type: "post-process" as const,
    async: false,
    func(code: string) {
      return `${code}\n/* ${tag} */`;
    },
  };
}

export default {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      plugins: [createTagPlugin("release")],
    },
  ],
};
```

Note: factory plugins are invoked at plugin-processing stages, so keep factories deterministic and lightweight.

## 6. Verify plugin behavior

Run builds and inspect output:

```sh
npx susee
```

What to check:

- Your transformed code appears in generated `.mjs`/`.cjs` files
- Sourcemaps still resolve correctly
- Output remains valid JavaScript

## Common mistakes

- Returning the wrong shape (`string` vs `DepsFiles`)
- Mutating shared state in ways that break multiple output formats
- Assuming plugin factories run only once
- Producing syntax-invalid output

## Best practices

- Keep one plugin focused on one concern
- Make transforms idempotent where possible
- Add `name` for easier debugging
- Prefer pure transforms over hidden side effects

## Related pages

- [Plugin Types and Lifecycle](/guide/plugin-types-lifecycle)
- [Entry Points](/guide/entry-points)
- [Configuration File Structure](/guide/config-file-structure)
