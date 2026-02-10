import path from "node:path";
import type { BundleVisitor, NamesSets, NodeVisit } from "@suseejs/types";
import ts from "typescript";

const anonymousImportVisitor: BundleVisitor = (
	context,
	depsTree,
	sourceFile,
	exportDefaultExportNameMap: NamesSets,
	exportDefaultImportNameMap: NamesSets,
) => {
	const { factory } = context;
	const visit: NodeVisit = (node) => {
		if (ts.isImportDeclaration(node)) {
			const fileName = node.moduleSpecifier.getText(sourceFile);
			const _name = (path.basename(fileName).split(".")[0] as string).trim();
			// check only import default expression
			if (node.importClause?.name && ts.isIdentifier(node.importClause.name)) {
				const base = node.importClause.name.text.trim();
				const mapping = exportDefaultExportNameMap.find(
					(v) => v.file === _name,
				);
				if (mapping) {
					exportDefaultImportNameMap.push({
						base,
						file: depsTree.file,
						newName: mapping.newName,
						isEd: true,
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
		}
		return ts.visitEachChild(node, visit, context);
	};
	return visit;
};

export default anonymousImportVisitor;
