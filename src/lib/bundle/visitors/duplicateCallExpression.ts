import type { BundleVisitor, NamesSets, NodeVisit } from "@suseejs/types";
import ts from "typescript";

const duplicateCallExpressionVisitor: BundleVisitor = (
	context,
	depsTree,
	_sourceFile,
	callNameMap: NamesSets,
	importNameMap: NamesSets,
) => {
	const { factory } = context;
	const visit: NodeVisit = (node) => {
		if (ts.isCallExpression(node)) {
			if (ts.isIdentifier(node.expression)) {
				const base = node.expression.text;
				let new_name: string | null = null;
				const mapping = callNameMap.find(
					(m) => m.base === base && m.file === depsTree.file,
				);
				const importMapping = importNameMap.find(
					(m) => m.base === base && m.file === depsTree.file,
				);
				if (mapping) {
					new_name = mapping.newName;
				} else if (importMapping) {
					new_name = importMapping.newName;
					//flag.push(new_name);
				}
				if (new_name) {
					return factory.updateCallExpression(
						node,
						factory.createIdentifier(new_name),
						node.typeArguments,
						node.arguments,
					);
				}
			}
		} else if (ts.isPropertyAccessExpression(node)) {
			if (ts.isIdentifier(node.expression)) {
				const base = node.expression.text;
				let new_name: string | null = null;
				const mapping = callNameMap.find(
					(m) => m.base === base && m.file === depsTree.file,
				);
				const importMapping = importNameMap.find(
					(m) => m.base === base && m.file === depsTree.file,
				);
				if (mapping) {
					new_name = mapping.newName;
				} else if (importMapping) {
					new_name = importMapping.newName;
				}
				if (new_name) {
					return factory.updatePropertyAccessExpression(
						node,
						factory.createIdentifier(new_name),
						node.name,
					);
				}
			}
		} else if (ts.isNewExpression(node)) {
			if (ts.isIdentifier(node.expression)) {
				const base = node.expression.text;
				let new_name: string | null = null;
				const mapping = callNameMap.find(
					(m) => m.base === base && m.file === depsTree.file,
				);
				const importMapping = importNameMap.find(
					(m) => m.base === base && m.file === depsTree.file,
				);
				if (mapping) {
					new_name = mapping.newName;
				} else if (importMapping) {
					new_name = importMapping.newName;
				}
				if (new_name) {
					return factory.updateNewExpression(
						node,
						factory.createIdentifier(new_name),
						node.typeArguments,
						node.arguments,
					);
				}
			}
		}
		/* ----------------------Returns for visitor function------------------------------- */
		return ts.visitEachChild(node, visit, context);
	};
	return visit;
};

export default duplicateCallExpressionVisitor;
