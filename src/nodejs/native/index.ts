/**
 * JS-side wrapper for susee's native Rust AST engine.
 *
 * This is the replacement for the TS Transformer APIs (`ts.SourceFile`,
 * `ts.Node`, `ts.createSourceFile`, `ts.createPrinter`, `ts.forEachChild`)
 * that became unstable in TS7. It loads the Rust `cdylib` (built with
 * `cargo build --release --features napi`) via `@napi-rs/cli`'s platform-
 * specific resolver and re-exports the parse/visit/print API plus the
 * node-type predicates.
 *
 * ## Why a wrapper?
 * The native addon is a single `.node` file produced by napi-rs. This
 * wrapper handles platform-specific loading (via `@napi-rs/cli`'s
 * generated index) and adds JS-ergonomic documentation so plugin authors
 * don't need to know about the Rust side.
 *
 * ## Usage
 * ```ts
 * import { parseSourceFile, isImportDeclaration, visit } from "susee/native";
 *
 * const sf = parseSourceFile(code, "entry.ts");
 * visit(sf.program, (node) => {
 *   if (isImportDeclaration(node)) {
 *     console.log("import from", node.source.value);
 *   }
 * });
 * ```
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load the platform-specific native addon.
 *
 * napi-rs builds a `.node` file per platform (e.g.
 * `susee.linux-x64-gnu.node`). In a published package these live under
 * `napi/` and are resolved by `@napi-rs/cli`'s generated loader. During
 * local development we fall back to the cargo build output.
 */
function loadNative(): typeof import("./types.js") {
	// 1. Try the @napi-rs generated loader (production / published package).
	try {
		// `@napi-rs/cli` generates an `index.js` next to the `.node` files
		// that picks the right platform binary.
		return require("../napi/index.js");
	} catch {}
	// 2. Fall back to the local cargo build output.
	const here = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		// `cargo build --release --features napi` output.
		join(here, "..", "..", "..", "target", "release", "libsusee.node"),
		// `cargo build --features napi` (debug) output.
		join(here, "..", "..", "..", "target", "debug", "libsusee.node"),
	];
	for (const p of candidates) {
		if (existsSync(p)) {
			return require(p);
		}
	}
	throw new Error(
		`[susee/native]: Could not load the native addon. Build it with:\n  cargo build --release --features napi\nthen retry. Looked in:\n  ${candidates.join("\n  ")}`,
	);
}

const native = loadNative();

/**
 * Parse TypeScript/JavaScript source into a `SourceFile`.
 *
 * Mirrors `ts.createSourceFile(fileName, sourceText, ScriptTarget.Latest, true)`.
 * The `fileName` is used only to pick the language variant (`.tsx` → TSX,
 * `.json` → JSON, etc.) — it does not need to exist on disk.
 *
 * @returns A `SourceFile` with `.program` (the AST as a JS object),
 * `.text()` (original source), `.print()` (re-formatted source), and
 * `.toJson()` (AST as a JSON string).
 */
export const parseSourceFile = native.parseSourceFile;

/**
 * Re-print a `SourceFile`'s AST as formatted source.
 * Mirrors `ts.createPrinter().printFile(sourceFile)`.
 */
export const printSourceFile = (sf: { print(): string }): string => sf.print();

// ---------------------------------------------------------------------------
// Node-type predicates (mirror the `ts.isXxx` family).
// ---------------------------------------------------------------------------

export const isImportDeclaration = native.isImportDeclaration;
export const isExportNamedDeclaration = native.isExportNamedDeclaration;
export const isExportDefaultDeclaration = native.isExportDefaultDeclaration;
export const isExportAllDeclaration = native.isExportAllDeclaration;
export const isIdentifier = native.isIdentifier;
export const isVariableDeclaration = native.isVariableDeclaration;
export const isFunctionDeclaration = native.isFunctionDeclaration;
export const isClassDeclaration = native.isClassDeclaration;
export const isCallExpression = native.isCallExpression;
export const isStringLiteral = native.isStringLiteral;
export const isTypeAliasDeclaration = native.isTypeAliasDeclaration;
export const isInterfaceDeclaration = native.isInterfaceDeclaration;
export const isJsxElement = native.isJsxElement;
export const isJsxFragment = native.isJsxFragment;

/**
 * Return a node's `type` discriminant (e.g. `"ImportDeclaration"`), or
 * `null` if the value isn't an AST node.
 */
export const nodeType = native.nodeType;

/**
 * Walk an AST depth-first, calling `callback(node, parent)` for every node.
 *
 * Mirrors `ts.forEachChild` but visits *all* nested nodes recursively.
 * Return `true` from the callback to stop the walk.
 *
 * @param node    The root node (e.g. `sourceFile.program`).
 * @param callback Receives the current node and its parent (or `null` for
 *   the root). Return `true` to stop.
 */
export const visit = native.visit;

// ---------------------------------------------------------------------------
// Build driver — run a build with JS plugins (sync or async).
// ---------------------------------------------------------------------------

/**
 * A susee plugin entry: an object `{ type, async?, func, name? }` or a
 * factory function `() => PluginObject`. Re-homed from `@suseejs/type`
 * (no TS APIs). See `plugins.d.ts` for the full shapes.
 */
type SuseePluginEntry =
	| {
			type: "dependency" | "pre-process" | "post-process";
			async?: boolean;
			// deno-lint-ignore no-explicit-any
			func: (...args: any[]) => unknown;
			name?: string;
	  }
	| (() => {
			type: "dependency" | "pre-process" | "post-process";
			// deno-lint-ignore no-explicit-any
			func: (...args: any[]) => unknown;
			name?: string;
	  });

/**
 * Normalize the user's `plugins[]` (object + factory forms) into the three
 * parallel arrays the native `buildWithPlugins` expects:
 * `[funcs[], names[]]` per stage.
 *
 * The native driver accepts `ThreadsafeFunction` params (Send+Sync) rather
 * than napi `Object`s (which would make the async future non-Send). This
 * wrapper flattens the user-facing `{ type, func, name }` shape into those
 * arrays.
 */
function partitionPlugins(plugins: SuseePluginEntry[]): {
	depsFuncs: Array<(depsFiles: unknown, ctx: unknown) => void>;
	depsNames: (string | null)[];
	preFuncs: Array<(code: string, entry: string) => string>;
	preNames: (string | null)[];
	postFuncs: Array<(code: string, entry: string) => string>;
	postNames: (string | null)[];
} {
	const depsFuncs: Array<(depsFiles: unknown, ctx: unknown) => void> = [];
	const depsNames: (string | null)[] = [];
	const preFuncs: Array<(code: string, entry: string) => string> = [];
	const preNames: (string | null)[] = [];
	const postFuncs: Array<(code: string, entry: string) => string> = [];
	const postNames: (string | null)[] = [];

	for (const entry of plugins) {
		const p = typeof entry === "function" ? entry() : entry;
		switch (p.type) {
			case "dependency": {
				depsFuncs.push(p.func as (depsFiles: unknown, ctx: unknown) => void);
				depsNames.push(p.name ?? null);
				break;
			}
			case "pre-process": {
				preFuncs.push(p.func as (code: string, entry: string) => string);
				preNames.push(p.name ?? null);
				break;
			}
			case "post-process": {
				postFuncs.push(p.func as (code: string, entry: string) => string);
				postNames.push(p.name ?? null);
				break;
			}
		}
	}
	return { depsFuncs, depsNames, preFuncs, preNames, postFuncs, postNames };
}

/**
 * Run a susee build from a config file with JS plugins.
 *
 * This is the JS-facing replacement for the TS `build()` API. It runs a
 * full build (bundler + compiler) with JS-authored plugins hooked into
 * the `dependency`, `pre-process`, and `post-process` stages. Both sync
 * and async JS plugins are supported — async plugins (returning a
 * Promise) are awaited automatically by the native runtime.
 *
 * @param configPath Path to a `susee.config.json`, or `null` for default
 *   discovery (`susee.config.json` in the cwd).
 * @param plugins Array of plugin objects `{ type, async?, func, name? }`
 *   or factory functions `() => PluginObject`. May be empty.
 * @returns A `Promise<void>` that resolves on success / rejects on error.
 *
 * @example
 * ```js
 * import { buildWithPlugins } from "susee/native";
 * await buildWithPlugins(null, [
 *   {
 *     type: "post-process",
 *     async: true,
 *     name: "terser",
 *     func: async (code, entry) => (await import("terser")).minify(code).code,
 *   },
 * ]);
 * ```
 */
export async function buildWithPlugins(
	configPath: string | null,
	plugins: SuseePluginEntry[],
): Promise<void> {
	const { depsFuncs, depsNames, preFuncs, preNames, postFuncs, postNames } =
		partitionPlugins(plugins);
	// The native `buildWithPlugins` accepts the callbacks as
	// ThreadsafeFunction params (Send+Sync) so the async future stays Send.
	// napi coerces JS functions into TSFNs at the boundary.
	return native.buildWithPlugins(
		configPath,
		depsFuncs,
		depsNames,
		preFuncs,
		preNames,
		postFuncs,
		postNames,
	);
}
