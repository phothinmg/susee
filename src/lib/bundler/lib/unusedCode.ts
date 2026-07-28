import ts6 from "@typescript/typescript6";
import { createBundledSourceFile, transformBundledSource } from "./helpers.js";

export interface ClearUnusedOptions {
	/** Treat exported symbols as used (default: true) */
	treatExportsAsUsed?: boolean;
}

function collectBindingNames(name: ts6.BindingName, out: string[]) {
	if (ts6.isIdentifier(name)) out.push(name.text);
	else if (
		ts6.isObjectBindingPattern(name) ||
		ts6.isArrayBindingPattern(name)
	) {
		name.elements.forEach((el) => {
			if (ts6.isBindingElement(el) && el.name)
				collectBindingNames(el.name, out);
		});
	}
}

/**
 * Clear unused top-level declarations from a TypeScript source string.
 * - Removes only unused named import specifiers.
 * - Removes entire import declarations when an unused default or namespace import is present.
 * - Removes function and class declarations when their name is unused.
 * - Removes entire variable statements when none of the declared identifiers are used.
 *
 * Limitations: this works on a single-file basis and does not analyze cross-file usages.
 */
export default function (
	content: string,
	file: string,
	compilerOptions: ts6.CompilerOptions,
	options: ClearUnusedOptions = { treatExportsAsUsed: true },
) {
	const sourceFile = createBundledSourceFile(file, content);

	const defined = new Map<string, { exported: boolean }>();
	const used = new Set<string>();

	const markDefined = (name: string, exported = false) => {
		const prev = defined.get(name);
		defined.set(name, { exported: !!prev?.exported || exported });
	};

	// First pass: collect defined names (imports, vars, funcs, classes) and used identifiers
	const collect = (node: ts6.Node) => {
		// Definitions
		if (ts6.isImportDeclaration(node) && node.importClause) {
			const ic = node.importClause;
			if (ic.name && ts6.isIdentifier(ic.name))
				markDefined(ic.name.text, false);
			if (ic.namedBindings) {
				if (ts6.isNamedImports(ic.namedBindings)) {
					ic.namedBindings.elements.forEach((ele) => {
						if (ts6.isImportSpecifier(ele) && ts6.isIdentifier(ele.name))
							markDefined(ele.name.text, false);
					});
				} else if (
					ts6.isNamespaceImport(ic.namedBindings) &&
					ts6.isIdentifier(ic.namedBindings.name)
				) {
					markDefined(ic.namedBindings.name.text, false);
				}
			}
		} else if (
			ts6.isImportEqualsDeclaration(node) &&
			ts6.isIdentifier(node.name)
		) {
			markDefined(node.name.text, false);
		} else if (ts6.isVariableStatement(node)) {
			const exported =
				node.modifiers?.some((m) => m.kind === ts6.SyntaxKind.ExportKeyword) ??
				false;
			node.declarationList.declarations.forEach((d) => {
				collectBindingNames(d.name, []);
				const names: string[] = [];
				collectBindingNames(d.name, names);
				names.forEach((n) => markDefined(n, exported));
			});
		} else if (
			ts6.isFunctionDeclaration(node) &&
			node.name &&
			ts6.isIdentifier(node.name)
		) {
			const exported =
				node.modifiers?.some((m) => m.kind === ts6.SyntaxKind.ExportKeyword) ??
				false;
			markDefined(node.name.text, exported);
		} else if (
			ts6.isClassDeclaration(node) &&
			node.name &&
			ts6.isIdentifier(node.name)
		) {
			const exported =
				node.modifiers?.some((m) => m.kind === ts6.SyntaxKind.ExportKeyword) ??
				false;
			markDefined(node.name.text, exported);
		}

		// Usage: any identifier that is not a declaration name is considered a use
		if (ts6.isIdentifier(node)) {
			const parent = node.parent;
			const isDeclarationName =
				(ts6.isVariableDeclaration(parent) && parent.name === node) ||
				(ts6.isFunctionDeclaration(parent) && parent.name === node) ||
				(ts6.isClassDeclaration(parent) && parent.name === node) ||
				(ts6.isImportClause(parent) && parent.name === node) ||
				(ts6.isImportSpecifier(parent) && parent.name === node) ||
				(ts6.isNamespaceImport(parent) && parent.name === node) ||
				(ts6.isBindingElement(parent) && parent.name === node) ||
				(ts6.isParameter(parent) && parent.name === node);

			if (!isDeclarationName) used.add(node.text);
		}

		ts6.forEachChild(node, collect);
	};

	collect(sourceFile);

	// Determine unused names
	const unused = new Set<string>();
	defined.forEach((meta, name) => {
		if (used.has(name)) return;
		if (options.treatExportsAsUsed && meta.exported) return;
		unused.add(name);
	});

	// Transformer: remove nodes that are unused according to rules
	const transformer: ts6.TransformerFactory<ts6.SourceFile> = (
		context: ts6.TransformationContext,
	) => {
		const visitor = (node: ts6.Node): ts6.VisitResult<ts6.Node> => {
			// ImportDeclaration:
			// - remove whole statement when default/namespace import is unused
			// - otherwise remove only unused named specifiers
			if (ts6.isImportDeclaration(node) && node.importClause) {
				const ic = node.importClause;

				const defaultName =
					ic.name && ts6.isIdentifier(ic.name) ? ic.name.text : undefined;
				let namespaceName: string | undefined;
				const namedElements: ts6.ImportSpecifier[] = [];

				if (ic.namedBindings) {
					if (ts6.isNamedImports(ic.namedBindings)) {
						ic.namedBindings.elements.forEach((ele) => {
							if (ts6.isImportSpecifier(ele) && ts6.isIdentifier(ele.name))
								namedElements.push(ele);
						});
					} else if (
						ts6.isNamespaceImport(ic.namedBindings) &&
						ts6.isIdentifier(ic.namedBindings.name)
					) {
						namespaceName = ic.namedBindings.name.text;
					}
				}

				const defaultUsed = defaultName ? !unused.has(defaultName) : false;
				const namespaceUsed = namespaceName
					? !unused.has(namespaceName)
					: false;
				const keptNamed = namedElements.filter(
					(ele) => !unused.has(ele.name.text),
				);

				if (
					(defaultName && !defaultUsed) ||
					(namespaceName && !namespaceUsed)
				) {
					return ts6.factory.createNotEmittedStatement(node);
				}

				if (
					namedElements.length > 0 &&
					keptNamed.length === 0 &&
					!defaultName
				) {
					return ts6.factory.createNotEmittedStatement(node);
				}

				if (keptNamed.length !== namedElements.length) {
					const newImportClause = ts6.factory.createImportClause(
						false,
						defaultName ? ts6.factory.createIdentifier(defaultName) : undefined,
						ts6.factory.createNamedImports(keptNamed),
					);
					return ts6.factory.updateImportDeclaration(
						node,
						node.modifiers,
						newImportClause,
						node.moduleSpecifier,
						// biome-ignore  lint/suspicious/noExplicitAny : ts
						(node as any).assertClause,
					);
				}

				return node;
			}

			// FunctionDeclaration / ClassDeclaration: remove if named and unused
			if (
				(ts6.isFunctionDeclaration(node) || ts6.isClassDeclaration(node)) &&
				node.name &&
				ts6.isIdentifier(node.name)
			) {
				if (unused.has(node.name.text))
					return ts6.factory.createNotEmittedStatement(node);
				return node;
			}

			// VariableStatement: remove whole statement only if none of declared names are used
			if (ts6.isVariableStatement(node)) {
				const names: string[] = [];
				node.declarationList.declarations.forEach((d) =>
					collectBindingNames(d.name, names),
				);
				const anyUsed = names.some((n) => !unused.has(n));
				if (!anyUsed) return ts6.factory.createNotEmittedStatement(node);
				return node;
			}

			return ts6.visitEachChild(node, visitor, context);
		};

		return (root) => ts6.visitNode(root, visitor) as ts6.SourceFile;
	};

	const output = transformBundledSource(
		sourceFile,
		compilerOptions,
		transformer,
	);
	return output;
}
