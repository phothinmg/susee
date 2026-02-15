import transformFunction from "@suseejs/transformer";
import ts from "typescript";
import uniqueName from "./uniqueName.js";

function duplicates(
	content: string,
	file: string,
	compilerOptions: ts.CompilerOptions,
) {
	const sourceFile = ts.createSourceFile(
		file,
		content,
		ts.ScriptTarget.Latest,
		true,
	);

	// collect import bindings and detect duplicates inside this file only
	type ImportBinding = {
		name: string;
		node: ts.Node;
	};

	const bindings: Map<string, ImportBinding[]> = new Map();

	for (const stmt of sourceFile.statements) {
		if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
		const ipc = stmt.importClause;
		// default import
		if (ipc.name && ts.isIdentifier(ipc.name)) {
			const n = ipc.name.text;
			bindings.set(n, (bindings.get(n) || []).concat({ name: n, node: ipc }));
		}
		// namespace import `import * as ns from 'x'`
		else if (
			ipc.namedBindings &&
			ts.isNamespaceImport(ipc.namedBindings) &&
			ts.isIdentifier(ipc.namedBindings.name)
		) {
			const n = ipc.namedBindings.name.text;
			bindings.set(
				n,
				(bindings.get(n) || []).concat({ name: n, node: ipc.namedBindings }),
			);
		}
		// named imports `import { a as b, c } from 'x'`
		else if (ipc.namedBindings && ts.isNamedImports(ipc.namedBindings)) {
			for (const el of ipc.namedBindings.elements) {
				if (ts.isIdentifier(el.name)) {
					const n = el.name.text;
					bindings.set(
						n,
						(bindings.get(n) || []).concat({ name: n, node: el }),
					);
				}
			}
		}
	}

	// build rename map for duplicates (keep first occurrence unchanged)
	const renameMap: Map<string, string> = new Map();
	const gen = uniqueName();
	gen.setPrefix({ key: "DuplicateImport", value: "__dup__" });

	for (const [name, arr] of bindings.entries()) {
		if (arr.length > 1) {
			// skip first, rename subsequent
			for (let i = 1; i < arr.length; i++) {
				const newName = gen.getName("DuplicateImport", `${name}_`);
				// record renaming for the local name
				renameMap.set(`${name}::${i}`, newName);
				// also map plain name to first new name only if not yet set (for simpler lookup)
				renameMap.set(`${name}::occurrence_${i}`, newName);
			}
		}
	}

	// For easier lookup during transform, build a flat map from node position -> new name
	const nodeRenameByPos: Map<number, string> = new Map();
	for (const [name, arr] of bindings.entries()) {
		if (arr.length > 1) {
			for (let i = 1; i < arr.length; i++) {
				const binding = arr[i];
				if (binding?.node) {
					nodeRenameByPos.set(
						binding.node.pos,
						renameMap.get(`${name}::${i}`) as string,
					);
				}
			}
		}
	}

	const transformer: ts.TransformerFactory<ts.SourceFile> = (
		context: ts.TransformationContext,
	) => {
		const { factory } = context;

		const isDeclarationName = (id: ts.Identifier) => {
			const parent = id.parent;
			if (!parent) return false;
			switch (parent.kind) {
				case ts.SyntaxKind.ImportSpecifier:
				case ts.SyntaxKind.NamespaceImport:
				case ts.SyntaxKind.ImportClause:
				case ts.SyntaxKind.VariableDeclaration:
				case ts.SyntaxKind.FunctionDeclaration:
				case ts.SyntaxKind.ClassDeclaration:
				case ts.SyntaxKind.InterfaceDeclaration:
				case ts.SyntaxKind.TypeAliasDeclaration:
				case ts.SyntaxKind.EnumDeclaration:
				case ts.SyntaxKind.Parameter:
				case ts.SyntaxKind.PropertyDeclaration:
				case ts.SyntaxKind.MethodDeclaration:
				case ts.SyntaxKind.BindingElement:
					return true;
				default:
					return false;
			}
		};

		const visitor = (node: ts.Node): ts.Node => {
			// update import declarations when their bindings are duplicates
			if (ts.isImportDeclaration(node) && node.importClause) {
				const ipc = node.importClause;
				let changed = false;
				let newImportClause = ipc;

				// default import
				if (ipc.name && ts.isIdentifier(ipc.name)) {
					const _pos = ipc.pos;
					const newName = nodeRenameByPos.get(ipc.pos);
					if (newName) {
						newImportClause = factory.updateImportClause(
							ipc,
							ipc.isTypeOnly,
							factory.createIdentifier(newName),
							ipc.namedBindings,
						);
						changed = true;
					}
				}

				// namespace import
				if (
					ipc.namedBindings &&
					ts.isNamespaceImport(ipc.namedBindings) &&
					ts.isIdentifier(ipc.namedBindings.name)
				) {
					const newName = nodeRenameByPos.get(ipc.namedBindings.pos);
					if (newName) {
						const nb = factory.createNamespaceImport(
							factory.createIdentifier(newName),
						);
						newImportClause = factory.updateImportClause(
							newImportClause,
							newImportClause.isTypeOnly,
							newImportClause.name,
							nb,
						);
						changed = true;
					}
				}

				// named imports
				if (ipc.namedBindings && ts.isNamedImports(ipc.namedBindings)) {
					const elements = ipc.namedBindings.elements.map((el) => {
						if (ts.isIdentifier(el.name)) {
							const newName = nodeRenameByPos.get(el.pos);
							if (newName) {
								changed = true;
								return factory.updateImportSpecifier(
									el,
									el.isTypeOnly,
									el.propertyName,
									factory.createIdentifier(newName),
								);
							}
						}
						return el;
					});
					if (changed) {
						const named = factory.createNamedImports(elements);
						newImportClause = factory.updateImportClause(
							newImportClause,
							newImportClause.isTypeOnly,
							newImportClause.name,
							named,
						);
					}
				}

				if (changed) {
					return factory.updateImportDeclaration(
						node,
						node.modifiers,
						newImportClause,
						node.moduleSpecifier,
						node.assertClause,
					);
				}
			}

			// replace identifier usages that reference renamed imports
			if (ts.isIdentifier(node)) {
				const txt = node.text;
				// find whether this identifier corresponds to a renamed binding
				// we conservatively check by name and skip if it's a declaration name or property access name
				if (!isDeclarationName(node)) {
					if (
						node.parent &&
						ts.isPropertyAccessExpression(node.parent) &&
						node.parent.name === node
					) {
						// property name, skip
						return node;
					}
					// check if there were duplicates for this base name
					const arr = bindings.get(txt);
					if (arr && arr.length > 1) {
						// if this identifier belongs to the first binding occurrence we keep it
						// otherwise we map it to corresponding renamed occurrence by heuristic: prefer first rename
						// Use simplest approach: if any renaming exists for this base, replace with the first generated new name
						// find the first generated new name for this base
						for (let i = 1; i < arr.length; i++) {
							const newName =
								renameMap.get(`${txt}::occurrence_${i}`) ||
								renameMap.get(`${txt}::${i}`);
							if (newName) {
								return factory.createIdentifier(newName);
							}
						}
					}
				}
			}

			return ts.visitEachChild(node, visitor, context);
		};
		return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
	};

	const _content = transformFunction(transformer, sourceFile, compilerOptions);
	return _content;
}

export default duplicates;
