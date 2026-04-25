# Plugin Types and Lifecycle

Susee supports three plugin types that run at different stages of the build pipeline.

This page explains:

- Which plugin types are available
- The function signature for each type
- Exactly when each type runs in the build lifecycle

For hands-on implementation steps and authoring examples, see [How to Write Plugins](/guide/how-to-write-plugins).

## Plugin type summary

Susee plugin definitions come from `@suseejs/type` and support both sync and async handlers.

### 1) `dependency`

Runs during dependency processing, before final code is merged.

- Input: `DepsFiles`, `compilerOptions`
- Output: transformed `DepsFiles`

Use this when you need to modify dependency file objects (for example, module normalization or file-level transforms before merge).

### 2) `pre-process`

Runs after Susee has merged dependency and entry content into one code string, but before TypeScript compilation to `.mjs`/`.cjs`.

- Input: merged code string, entry file path
- Output: transformed code string

Use this for code-level edits on the bundled source (banner insertion, rewrites, feature flags, etc.).

### 3) `post-process`

Runs after `suseeCompiler` compiles output code in the Susee compiler stage.

- Input: compiled output code string, entry file path
- Output: transformed code string

Use this for output-level changes that should happen right before files are written.

## Plugin object and factory forms

Each item in `entryPoints[].plugins` can be either:

- A plugin object
- A plugin factory function returning a plugin object

Supported config type:

```ts
plugins?: (SuseePlugin | SuseePluginFunction)[];
```

## Type signatures

The following shape is supported for each plugin type (sync and async):

```ts
type PostProcessPlugin =
 | {
   type: "post-process";
   async: true;
   func: (code: string, file?: string) => Promise<string>;
   name?: string;
  }
 | {
   type: "post-process";
   async: false;
   func: (code: string, file?: string) => string;
   name?: string;
  };

type PreProcessPlugin =
 | {
   type: "pre-process";
   async: true;
   func: (code: string, file?: string) => Promise<string>;
   name?: string;
  }
 | {
   type: "pre-process";
   async: false;
   func: (code: string, file?: string) => string;
   name?: string;
  };

type DependencyPlugin =
 | {
   type: "dependency";
   async: true;
   func: (depsFiles: DepsFiles, compilerOptions: ts.CompilerOptions) => Promise<DepsFiles>;
   name?: string;
  }
 | {
   type: "dependency";
   async: false;
   func: (depsFiles: DepsFiles, compilerOptions: ts.CompilerOptions) => DepsFiles;
   name?: string;
  };
```

## Lifecycle order

For each entry and format (`esm` and/or `commonjs`), Susee runs this high-level flow:

1. Resolve compiler options (`tsconfigFilePath` -> root `tsconfig.json` -> defaults)
2. Run bundler
3. Run `dependency` plugins inside bundler
4. Run internal bundler normalization steps
5. Run `pre-process` plugins inside bundler
6. Compile bundled code with `suseeCompiler`
7. Rename sourcemap reference (`.js.map` -> `.mjs.map`/`.cjs.map`)
8. Run `post-process` plugins in compiler
9. Write output files

Execution semantics:

- Plugins run in array order.
- Async plugins are awaited.
- Sync and async plugins can be mixed.

## Important behavior for plugin factories

When a plugin is provided as a function, Susee invokes the function at each plugin-processing stage.

That means a factory can be called multiple times in a single build:

- In bundler dependency phase
- In bundler pre-process phase
- In compiler post-process phase

And this repeats per output format.

Recommendation:

- Keep plugin factories deterministic and lightweight.
- Avoid relying on one-time mutable state inside factory scope.

## Related pages

- [How to Write Plugins](/guide/how-to-write-plugins)
- [Entry Points](/guide/entry-points)
- [Configuration File Structure](/guide/config-file-structure)
- [Quick Start](/guide/quick-start)
