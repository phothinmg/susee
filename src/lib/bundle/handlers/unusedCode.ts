import ts from "typescript";
import transformFunction from "./transformer.js";

export interface ClearUnusedOptions {
	/** Treat exported symbols as used (default: true) */
	treatExportsAsUsed?: boolean;
}

function collectBindingNames(name: ts.BindingName, out: string[]) {
	if (ts.isIdentifier(name)) out.push(name.text);
	else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
		name.elements.forEach((el) => {
			if (ts.isBindingElement(el) && el.name) collectBindingNames(el.name, out);
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
	compilerOptions: ts.CompilerOptions,
	options: ClearUnusedOptions = { treatExportsAsUsed: true },
) {
	const sourceFile = ts.createSourceFile(
		file,
		content,
		ts.ScriptTarget.Latest,
		true,
	);

	const defined = new Map<string, { exported: boolean }>();
	const used = new Set<string>();

	const markDefined = (name: string, exported = false) => {
		const prev = defined.get(name);
		defined.set(name, { exported: !!prev?.exported || exported });
	};

	// First pass: collect defined names (imports, vars, funcs, classes) and used identifiers
	const collect = (node: ts.Node) => {
		// Definitions
		if (ts.isImportDeclaration(node) && node.importClause) {
			const ic = node.importClause;
			if (ic.name && ts.isIdentifier(ic.name)) markDefined(ic.name.text, false);
			if (ic.namedBindings) {
				if (ts.isNamedImports(ic.namedBindings)) {
					ic.namedBindings.elements.forEach((ele) => {
						if (ts.isImportSpecifier(ele) && ts.isIdentifier(ele.name))
							markDefined(ele.name.text, false);
					});
				} else if (
					ts.isNamespaceImport(ic.namedBindings) &&
					ts.isIdentifier(ic.namedBindings.name)
				) {
					markDefined(ic.namedBindings.name.text, false);
				}
			}
		} else if (
			ts.isImportEqualsDeclaration(node) &&
			ts.isIdentifier(node.name)
		) {
			markDefined(node.name.text, false);
		} else if (ts.isVariableStatement(node)) {
			const exported =
				node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ??
				false;
			node.declarationList.declarations.forEach((d) => {
				collectBindingNames(d.name, []);
				const names: string[] = [];
				collectBindingNames(d.name, names);
				// biome-ignore  lint/suspicious/useIterableCallbackReturn : ts
				names.forEach((n) => markDefined(n, exported));
			});
		} else if (
			ts.isFunctionDeclaration(node) &&
			node.name &&
			ts.isIdentifier(node.name)
		) {
			const exported =
				node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ??
				false;
			markDefined(node.name.text, exported);
		} else if (
			ts.isClassDeclaration(node) &&
			node.name &&
			ts.isIdentifier(node.name)
		) {
			const exported =
				node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ??
				false;
			markDefined(node.name.text, exported);
		}

		// Usage: any identifier that is not a declaration name is considered a use
		if (ts.isIdentifier(node)) {
			const parent = node.parent;
			const isDeclarationName =
				(ts.isVariableDeclaration(parent) && parent.name === node) ||
				(ts.isFunctionDeclaration(parent) && parent.name === node) ||
				(ts.isClassDeclaration(parent) && parent.name === node) ||
				(ts.isImportClause(parent) && parent.name === node) ||
				(ts.isImportSpecifier(parent) && parent.name === node) ||
				(ts.isNamespaceImport(parent) && parent.name === node) ||
				(ts.isBindingElement(parent) && parent.name === node) ||
				(ts.isParameter(parent) && parent.name === node);

			if (!isDeclarationName) used.add(node.text);
		}

		ts.forEachChild(node, collect);
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
	const transformer: ts.TransformerFactory<ts.SourceFile> = (
		context: ts.TransformationContext,
	) => {
		const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
			// ImportDeclaration:
			// - remove whole statement when default/namespace import is unused
			// - otherwise remove only unused named specifiers
			if (ts.isImportDeclaration(node) && node.importClause) {
				const ic = node.importClause;

				const defaultName =
					ic.name && ts.isIdentifier(ic.name) ? ic.name.text : undefined;
				let namespaceName: string | undefined;
				const namedElements: ts.ImportSpecifier[] = [];

				if (ic.namedBindings) {
					if (ts.isNamedImports(ic.namedBindings)) {
						ic.namedBindings.elements.forEach((ele) => {
							if (ts.isImportSpecifier(ele) && ts.isIdentifier(ele.name))
								namedElements.push(ele);
						});
					} else if (
						ts.isNamespaceImport(ic.namedBindings) &&
						ts.isIdentifier(ic.namedBindings.name)
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
					return ts.factory.createNotEmittedStatement(node);
				}

				if (
					namedElements.length > 0 &&
					keptNamed.length === 0 &&
					!defaultName
				) {
					return ts.factory.createNotEmittedStatement(node);
				}

				if (keptNamed.length !== namedElements.length) {
					const newImportClause = ts.factory.createImportClause(
						false,
						defaultName ? ts.factory.createIdentifier(defaultName) : undefined,
						ts.factory.createNamedImports(keptNamed),
					);
					return ts.factory.updateImportDeclaration(
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
				(ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
				node.name &&
				ts.isIdentifier(node.name)
			) {
				if (unused.has(node.name.text))
					return ts.factory.createNotEmittedStatement(node);
				return node;
			}

			// VariableStatement: remove whole statement only if none of declared names are used
			if (ts.isVariableStatement(node)) {
				const names: string[] = [];
				// biome-ignore  lint/suspicious/useIterableCallbackReturn : ts
				node.declarationList.declarations.forEach((d) =>
					collectBindingNames(d.name, names),
				);
				const anyUsed = names.some((n) => !unused.has(n));
				if (!anyUsed) return ts.factory.createNotEmittedStatement(node);
				return node;
			}

			return ts.visitEachChild(node, visitor, context);
		};

		return (root) => ts.visitNode(root, visitor) as ts.SourceFile;
	};

	const output = transformFunction(transformer, sourceFile, compilerOptions);
	return output;
}
