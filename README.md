<div align="center">
	<img src="https://github.com/phothinmg/ptmbox/blob/main/kadown.svg" width="160" height="160" alt="susee" />
	<h1>susee</h1>
</div>

Tiny TypeScript bundler that emits CommonJS, ESM, and types in one build. Includes post-process hooks like banner injection and minification.

## Features

- Bundles a TypeScript entry with its dependency tree
- Outputs CommonJS (.cjs) and ESM (.mjs) builds with type declarations
- Auto-writes `package.json` fields (`main`, `module`, `types`, `exports`) and change `type` force to `module`.
- You can create post-process hooks (sync/async) for code that bundled and transformed by Typescript API.
- The package provided two hooks, `bannerText` and `minify` by terser.
- Limitations:
  1. Does not support export modifiers such as `export const foo = "foo"` or `export default function foo() {}`.
  2. Does not support anonymous exports like `export default function() {}` or `export default { foo: "bar" }`.
- Supports only named exports (`export { foo, bar }`) and default exports with an identifier.
- Does not remove exports from the entry file and does not bundle packages from `node_modules`.
- If the entry has both named exports and a default export (`export { foo, bar }` and `export default foo`), the CommonJS output drops named exports. In such cases, wrap exports in a namespace.

## Installation

```bash
npm i -D susee
```

## Usage

```ts
import susee from "susee";
import bannerText from "susee/banner-text";
import minify from "susee/minify";

const license = "/*! My Library */";

await susee.build({
  entry: "src/index.ts",
  outDir: "dist",
  target: "both",
  defaultExportName: "myLib",
  hooks: [bannerText(license), minify()],
});
```

## API

### `susee.build(options)`

**Options**

````ts
/**
 * Build configuration.
 */
interface BuildOptions {
  /**
   * Entry file to bundle.
   */
  entry: string;
  /**
   * Output target: `"commonjs"`, `"esm"`, or `"both"`.
   *
   * default - "both"
   */
  target?: Target;
  /**
   * Default export name if applicable.
   * - Required when the entry has default export and `options.target` = `"commonjs"` or `"both"`
   *
   * Example :
   *
   * ```ts
   * const foo = {bar:"foo"};
   * export default foo; // defaultExportName = "foo"
   * ```
   *
   * default - undefined
   */
  defaultExportName?: string | undefined;
  /**
   * Whether this build represents the main export , otherwise subpath export.
   *
   * default - true
   */
  isMainExport?: boolean;
  /**
   * Output directory.
   *
   * For a subpath export (not the main export), `outDir` must be a single-level
   * nested folder under the main output directory.
   *
   * Example:
   *
   * ```ts
   * const mainOutdir = "dist";
   * const subpathOutdir = "dist/subpath"; // subpath export in package.json will be "./subpath"
   * const fooOutdir = "dist/foo"; // subpath export in package.json will be "./foo"
   * ```
   *
   * default - "dist"
   */
  outDir?: string;
  /**
   * Identifiers to replace with blanks during compilation.
   *
   * default - []
   */
  replaceWithBlank?: string[];
  /**
   * Array of hook functions executed during compilation.
   *
   * default - []
   */
  hooks?: PostProcessHook[];
}
````

### `PostProcessHook`

```ts
type PostProcessHook =
  | { async: true; func: (code: string, file?: string) => Promise<string> }
  | { async: false; func: (code: string, file?: string) => string };
```

## License

ISC
