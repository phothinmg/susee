/**
 * Type declarations for susee's native AST engine.
 *
 * These describe the Rust `#[napi]` functions and the `SourceFile` class
 * exposed by `src/rust/napi/`. Plugin authors import from `susee/native`.
 */

/**
 * A parsed TypeScript/JavaScript source file.
 *
 * Equivalent to `ts.SourceFile`. The AST is exposed as a plain JS object
 * (the ESTree shape oxc serializes) rather than a mutable node tree.
 */
export interface SourceFile {
	/** The file name passed to `parseSourceFile`. */
	fileName(): string;
	/** The original source text, unchanged. */
	text(): string;
	/** Re-print the AST as formatted source (re-parses + codegens). */
	print(): string;
	/** The AST as a JSON string (ESTree shape). */
	toJson(): string;
	/** The AST as a JS object (ESTree shape). */
	readonly program: object;
}

/**
 * Parse TypeScript/JavaScript source into a `SourceFile`.
 *
 * @param sourceText The source code.
 * @param fileName   Used to pick the language variant (`.tsx` → TSX, etc.).
 *   Does not need to exist on disk.
 */
export function parseSourceFile(
	sourceText: string,
	fileName: string,
): SourceFile;

// ---------------------------------------------------------------------------
// Node-type predicates (mirror the `ts.isXxx` family).
// Each takes a node (a plain object from the AST) and returns `true` if the
// node's `type` discriminant matches.
// ---------------------------------------------------------------------------

export function isImportDeclaration(node: object): boolean;
export function isExportNamedDeclaration(node: object): boolean;
export function isExportDefaultDeclaration(node: object): boolean;
export function isExportAllDeclaration(node: object): boolean;
export function isIdentifier(node: object): boolean;
export function isVariableDeclaration(node: object): boolean;
export function isFunctionDeclaration(node: object): boolean;
export function isClassDeclaration(node: object): boolean;
export function isCallExpression(node: object): boolean;
export function isStringLiteral(node: object): boolean;
export function isTypeAliasDeclaration(node: object): boolean;
export function isInterfaceDeclaration(node: object): boolean;
export function isJsxElement(node: object): boolean;
export function isJsxFragment(node: object): boolean;

/** Return a node's `type` discriminant, or `null`. */
export function nodeType(node: object): string | null;

/**
 * Walk an AST depth-first, calling `callback` for every node.
 *
 * @param node     The root node (e.g. `sourceFile.program`).
 * @param callback Receives `(node, parent)`. Return `true` to stop the walk.
 */
export function visit(
	node: object,
	callback: (node: object, parent: object | null) => boolean | undefined | void,
): void;
