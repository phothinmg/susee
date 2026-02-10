import type { BundleVisitor, NamesSets, NodeVisit } from "@suseejs/types";
import ts from "typescript";
import { getModuleKeyFromSpecifier } from "./visitorHelpers.js";

/**
 * A BundleVisitor that updates the import declaration, property access expression, and new expression
 * with the anonymous default import name.
 *
 * @param {BundleVisitor} context - The BundleVisitor context.
 * @param {DepsTree} depsTree - The deps tree object.
 * @param {SourceFile} sourceFile - The source file object.
 * @param {NamesSets} exportNameMap - The export name map object.
 * @param {NamesSets} importNameMap - The import name map object.
 * @return {NodeVisit} visit - The NodeVisit function.
 */
const duplicateImportExpressionVisitor: BundleVisitor = (
	context,
	depsTree,
	sourceFile,
	exportNameMap: NamesSets,
	importNameMap: NamesSets,
) => {
	const { factory } = context;
	const visit: NodeVisit = (node) => {
		if (ts.isImportDeclaration(node)) {
			const moduleKey = getModuleKeyFromSpecifier(
				node.moduleSpecifier,
				sourceFile,
				depsTree.file,
			);
			let baseNames: string[] = [];
			if (
				node.importClause?.namedBindings &&
				ts.isNamedImports(node.importClause.namedBindings)
			) {
				baseNames = node.importClause.namedBindings.elements.map((el) =>
					el.name.text.trim(),
				);
			}
			// import default expression
			if (node.importClause?.name && ts.isIdentifier(node.importClause.name)) {
				const base = node.importClause.name.text.trim();
				const mapping = exportNameMap.find(
					(m) => m.base === base && m.file === moduleKey,
				);
				if (mapping) {
					importNameMap.push({
						base: mapping.base,
						file: depsTree.file,
						newName: mapping.newName,
					});
					const newImportClause = factory.updateImportClause(
						node.importClause,
						node.importClause.phaseModifier,
						factory.createIdentifier(mapping.newName),
						node.importClause.namedBindings,
					);
					return factory.updateImportDeclaration(
						node,
						node.modifiers,
						newImportClause,
						node.moduleSpecifier,
						node.attributes,
					);
				}
			}
			// import name , `import{ ... }`
			if (
				baseNames.length > 0 &&
				node.importClause &&
				node.importClause.namedBindings &&
				ts.isNamedImports(node.importClause.namedBindings)
			) {
				const updatedElements = node.importClause.namedBindings.elements.map(
					(el) => {
						const mapping = exportNameMap.find(
							(m) => m.base === el.name.text.trim() && m.file === moduleKey,
						);

						if (mapping) {
							importNameMap.push({
								base: mapping.base,
								file: depsTree.file,
								newName: mapping.newName,
							});
							return factory.updateImportSpecifier(
								el,
								el.isTypeOnly,
								el.propertyName,
								factory.createIdentifier(mapping.newName),
							);
						}
						return el;
					},
				);
				const newNamedImports = factory.updateNamedImports(
					node.importClause.namedBindings,
					updatedElements,
				);
				const newImportClause = factory.updateImportClause(
					node.importClause,
					node.importClause.phaseModifier,
					node.importClause.name,
					newNamedImports,
				);
				return factory.updateImportDeclaration(
					node,
					node.modifiers,
					newImportClause,
					node.moduleSpecifier,
					node.attributes,
				);
			}
		} //&&
		/* ----------------------Returns for visitor function------------------------------- */
		return ts.visitEachChild(node, visit, context);
	};
	return visit;
};

export default duplicateImportExpressionVisitor;
