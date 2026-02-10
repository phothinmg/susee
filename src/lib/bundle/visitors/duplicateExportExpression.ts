import type { BundleVisitor, NamesSets, NodeVisit } from "@suseejs/types";
import ts from "typescript";
import { getFileKey } from "./visitorHelpers.js";

/**
 * A BundleVisitor that updates the call expression, property access expression, and new expression
 * with the anonymous default import name.
 */
const duplicateExportExpressionVisitor: BundleVisitor = (
	context,
	depsTree,
	_sourceFile,
	callNameMap: NamesSets,
	importNameMap: NamesSets,
	exportNameMap: NamesSets,
) => {
	const { factory } = context;
	const visit: NodeVisit = (node) => {
		if (ts.isExportSpecifier(node)) {
			if (ts.isIdentifier(node.name)) {
				const base = node.name.text;
				let new_name: string | null = null;
				const mapping = callNameMap.find(
					(m) => m.base === base && m.file === depsTree.file,
				);
				const importMapping = importNameMap.find(
					(m) => m.base === base && m.file === depsTree.file,
				);
				if (mapping) {
					exportNameMap.push({
						base,
						file: getFileKey(depsTree.file),
						newName: mapping.newName,
					});
					new_name = mapping.newName;
				} else if (importMapping) {
					new_name = importMapping.newName;
				}
				if (new_name) {
					return factory.updateExportSpecifier(
						node,
						node.isTypeOnly,
						node.propertyName,
						factory.createIdentifier(new_name),
					);
				}
			}
		} else if (ts.isExportAssignment(node)) {
			const expr = node.expression;
			if (ts.isIdentifier(expr)) {
				const base = expr.text;
				let new_name: string | null = null;
				const mapping = callNameMap.find(
					(m) => m.base === base && m.file === depsTree.file,
				);
				const importMapping = importNameMap.find(
					(m) => m.base === base && m.file === depsTree.file,
				);
				if (mapping) {
					exportNameMap.push({
						base,
						file: getFileKey(depsTree.file),
						newName: mapping.newName,
					});
					new_name = mapping.newName;
				} else if (importMapping) {
					new_name = importMapping.newName;
				}
				if (new_name) {
					return factory.updateExportAssignment(
						node,
						node.modifiers,
						factory.createIdentifier(new_name),
					);
				}
			}
		}
		/* ----------------------Returns for visitor function------------------------------- */
		return ts.visitEachChild(node, visit, context);
	};
	return visit;
};

export default duplicateExportExpressionVisitor;
