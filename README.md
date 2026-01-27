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
npm i susee
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

Builds the given entry file and writes outputs plus `package.json` updates.

**Options**

- `entry` (string, required): Entry file path.
- `target` (`"commonjs" | "esm" | "both"`, default: `"both"`): Output format.
- `defaultExportName` (string | undefined): Default export name used for CommonJS conversion.
- `outDir` (string, default: `"dist"`): Output directory.
- `isMainExport` (boolean, default: `true`): If `false`, adds a subpath export.
- `replaceWithBlank` (string[], default: `[]`): Strings to remove from generated output.
- `hooks` (`PostProcessHook[]`, default: `[]`): Post-processing hooks applied per output file.

### `PostProcessHook`

```ts
type PostProcessHook =
  | { async: true; func: (code: string, file?: string) => Promise<string> }
  | { async: false; func: (code: string, file?: string) => string };
```

## Subpath Exports

The package exposes two helper hooks:

- `susee/banner-text` — prepends a banner string to `.js` outputs.
- `susee/minify` — minifies `.js` outputs using `terser`.

## Notes

- If both named and default exports exist in the entry, CommonJS output keeps the default export and drops named exports.
- For subpath builds, `outDir` should include a subfolder (e.g. `dist/banner-text`).

## License

ISC
