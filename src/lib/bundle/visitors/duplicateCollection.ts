// cSpell:disable

import type {
	BundleVisitor,
	DuplicatesNameMap,
	NodeVisit,
} from "@suseejs/types";
import ts from "typescript";

const duplicateCollectionVisitor: BundleVisitor = (
	context,
	depsTree,
	_sourceFile,
	namesMap: DuplicatesNameMap,
) => {
	//const { factory } = context;
	const visit: NodeVisit = (node, isGlobalScope = true) => {
		// Global declarations များကိုသာ collect လုပ်မယ်
		if (isGlobalScope) {
			// Variable statements (const, let, var)
			if (ts.isVariableStatement(node)) {
				node.declarationList.declarations.forEach((decl) => {
					if (ts.isIdentifier(decl.name)) {
						const $name = decl.name.text;
						if (!namesMap.has($name)) {
							namesMap.set($name, new Set([{ file: depsTree.file }]));
						} else {
							// biome-ignore  lint/style/noNonNullAssertion : !namesMap.has($name) before
							namesMap.get($name)!.add({ file: depsTree.file });
						}
					}
				});
			}
			// Function, Class, Enum, Interface, Type declarations
			else if (
				ts.isFunctionDeclaration(node) ||
				ts.isClassDeclaration(node) ||
				ts.isEnumDeclaration(node) ||
				ts.isInterfaceDeclaration(node) ||
				ts.isTypeAliasDeclaration(node)
			) {
				const $name = node.name?.text;
				if ($name) {
					if (!namesMap.has($name)) {
						namesMap.set($name, new Set([{ file: depsTree.file }]));
					} else {
						// biome-ignore  lint/style/noNonNullAssertion : !namesMap.has($name) before
						namesMap.get($name)!.add({ file: depsTree.file });
					}
				}
			}
		}

		// Local scope ထဲရောက်သွားတဲ့ node တွေအတွက် recursive visit
		if (
			ts.isBlock(node) ||
			ts.isFunctionDeclaration(node) ||
			ts.isFunctionExpression(node) ||
			ts.isArrowFunction(node) ||
			ts.isMethodDeclaration(node) ||
			ts.isClassDeclaration(node)
		) {
			// Local scope ထဲကို ဝင်သွားပြီဆိုတာနဲ့ isGlobalScope = false
			if (ts.isBlock(node)) {
				ts.visitNodes(node.statements, (child) => visit(child, false));
			} else {
				ts.forEachChild(node, (child) => {
					visit(child, false);
				});
			}
		} else {
			// Global scope ထဲဆက်ရှိနေတဲ့ node တွေအတွက်
			return ts.visitEachChild(
				node,
				(child) => visit(child, isGlobalScope),
				context,
			);
		}
		/* ----------------------Returns for visitNode function------------------------------- */
		return node;
	};
	return visit;
};

export default duplicateCollectionVisitor;
