/**
 * Susee-native plugin type definitions (no TS APIs).
 *
 * These replace the `@suseejs/type` plugin definitions (`SuseePlugin`,
 * `PreProcessPlugin`, `PostProcessPlugin`, `DependencyPlugin`) and the
 * `ts.CompilerOptions` argument of the `dependency` hook. Plugin authors
 * import from `susee/native` (or the generated `types.d.ts`).
 *
 * ## Plugin forms
 * - **Object form**: `{ type, async, func, name? }`.
 * - **Factory form**: a function `() => PluginObject`.
 *
 * Both are accepted in `susee.config`'s `plugins[]`. `async` is accepted
 * for API compatibility; hooks are invoked synchronously and JS async
 * hooks must be awaited inside `func` before returning.
 */

import type { SourceFile } from "./types.js";

// ---------------------------------------------------------------------------
// Compiler options (replaces ts.CompilerOptions).
// ---------------------------------------------------------------------------

/**
 * A minimal subset of compiler options exposed to JS plugins.
 *
 * Replaces `ts.CompilerOptions` in the `dependency` hook. Built from the
 * Rust `CompilerOptions` struct.
 */
export interface SuseeCompilerOptions {
	/** Output directory (e.g. `"dist"`). */
	outDir: string;
	/** Module kind: `"commonjs"` or `"es2020"`. */
	module?: "commonjs" | "es2020";
	/** Script target (e.g. `"latest"`, `"esnext"`). */
	target: string;
	/** JSX emit mode if set (`"react-jsx"`, `"preserve"`, ...). */
	jsx?: string;
	/** JSX runtime import source if set. */
	jsxImportSource?: string;
	/** Libs (`dom`, `esnext`, ...). */
	lib: string[];
	/** Whether `.js` inputs are allowed. */
	allowJs: boolean;
	/** Whether `.d.ts` declarations are emitted. */
	declaration: boolean;
	/** Whether source maps are emitted. */
	sourceMap: boolean;
}

// ---------------------------------------------------------------------------
// DepsFile / DepsFiles — the dependency tree passed to the dependency hook.
// ---------------------------------------------------------------------------

/** Module format of a dependency file. */
export type ModuleType = "cjs" | "esm" | "json";

/** Resolved file extension (including the dot). */
export type FileExt =
	| ".js"
	| ".cjs"
	| ".mjs"
	| ".ts"
	| ".cts"
	| ".mts"
	| ".tsx"
	| ".jsx"
	| ".json";

/**
 * A single dependency file entry in the `DepsFiles` tree.
 *
 * All fields are read/write via getters/setters; mutations are reflected
 * back into the Rust build.
 */
export interface DepsFileEntry {
	/** File path relative to the project root. */
	file: string;
	/** File contents as a UTF-8 string. */
	content: string;
	/** File size in bytes (read-only; recomputed from `content`). */
	readonly bytes: number;
	/** Module format. */
	moduleType: ModuleType;
	/** Resolved file extension including the dot. */
	fileExt: FileExt;
	/** Whether the file contains JSX syntax. */
	isJsx: boolean;
	/** Whether this is the entry file. */
	isEntry: boolean;

	/**
	 * Parse this entry's `content` into a `SourceFile` (oxc ESTree AST).
	 *
	 * Use the returned `SourceFile`'s `.program` and `visit()` to inspect
	 * the file's AST — the "AST for deps_files.content" hook.
	 */
	parse(): SourceFile;
}

/**
 * The dependency tree passed to a `dependency`-stage plugin.
 *
 * Provides array-like access plus npm, node-builtin, and warning
 * management.
 */
export interface DepsFiles {
	/** Number of dependency files. */
	readonly length: number;

	/** Get the entry at `index` (0-based), or `null` if out of range. */
	get(index: number): DepsFileEntry | null;
	/** Replace the entry at `index`. */
	set(index: number, entry: DepsFileEntry): void;
	/** Append an entry to the end. */
	push(entry: DepsFileEntry): void;
	/** Insert `entry` at `index`, shifting later entries right. */
	insertAt(index: number, entry: DepsFileEntry): void;
	/** Remove and return the entry at `index`, or `null` if out of range. */
	removeAt(index: number): DepsFileEntry | null;

	/** NPM package specifiers referenced by the tree. */
	npm: string[];
	/** Add an npm package specifier if not already present. */
	addNpm(spec: string): void;
	/** Remove an npm package specifier. No-op if absent. */
	removeNpm(spec: string): void;

	/** Node built-in modules referenced by the tree. */
	nodes: string[];
	/** Register a node built-in module (e.g. `"fs"`, `"path"`). */
	addNode(name: string): void;
	/** Remove a node built-in. No-op if absent. */
	removeNode(name: string): void;

	/** Warnings collected for the tree (mirrors `tree.warns`). */
	readonly warns: string[];
	/** Push a warning that susee surfaces. */
	addWarn(message: string): void;
}

// ---------------------------------------------------------------------------
// Plugin context (replaces positional hook arguments).
// ---------------------------------------------------------------------------

/**
 * Context passed to every JS plugin hook.
 *
 * Replaces the positional `func(depsFiles, compilerOptions)` /
 * `func(code, file?)` signatures with a single extensible object.
 */
export interface SuseePluginContext {
	/** The entry file path for the current build point. */
	readonly entry: string;
	/**
	 * The output format being emitted (`"esm"` / `"commonjs"`), or `null`
	 * for hooks that run before format selection (e.g. `onDependencies`).
	 */
	readonly format: "esm" | "commonjs" | null;
	/** The susee-native compiler options in effect (replaces `ts.CompilerOptions`). */
	readonly compilerOptions: SuseeCompilerOptions;
	/** Push a warning that susee surfaces. */
	warn(message: string): void;
}

// ---------------------------------------------------------------------------
// Plugin object shapes (object + factory forms).
// ---------------------------------------------------------------------------

/** A `dependency`-stage plugin object. */
export interface DependencyPlugin {
	/** Always `"dependency"`. */
	type: "dependency";
	/** Accepted for API compatibility; hooks are invoked synchronously. */
	async?: boolean;
	/**
	 * Receive the `DepsFiles` tree and context; mutate `depsFiles` in
	 * place (its fields are read/write). Return value is ignored.
	 */
	func: (depsFiles: DepsFiles, ctx: SuseePluginContext) => void;
	/** Optional name used in profiling output. */
	name?: string;
}

/** A `pre-process`-stage plugin object. */
export interface PreProcessPlugin {
	/** Always `"pre-process"`. */
	type: "pre-process";
	/** Accepted for API compatibility; hooks are invoked synchronously. */
	async?: boolean;
	/** Receive the bundled source and entry; return the transformed source. */
	func: (code: string, entry: string) => string;
	/** Optional name used in profiling output. */
	name?: string;
}

/** A `post-process`-stage plugin object. */
export interface PostProcessPlugin {
	/** Always `"post-process"`. */
	type: "post-process";
	/** Accepted for API compatibility; hooks are invoked synchronously. */
	async?: boolean;
	/** Receive the emitted JS and entry; return the transformed code. */
	func: (code: string, entry: string) => string;
	/** Optional name used in profiling output. */
	name?: string;
}

/** Any plugin object. */
export type SuseePlugin =
	| DependencyPlugin
	| PreProcessPlugin
	| PostProcessPlugin;

/** A factory function returning a plugin object. */
export type SuseePluginFunction = () => SuseePlugin;

/** Accepted entries in `susee.config`'s `plugins[]`. */
export type SuseePluginEntry = SuseePlugin | SuseePluginFunction;
