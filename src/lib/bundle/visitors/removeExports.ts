import type { BundleVisitor, NodeVisit } from "@suseejs/types";
import utilities from "@suseejs/utils";
import ts from "typescript";

/**
 * A BundleVisitor that removes all exports from the given source file.
 * It does so by stripping "export" modifiers from function, class, interface, type alias, enum, and variable declarations,
 * and by removing "export { foo }" and "export default" declarations entirely.
 */
const removeExportsVisitor: BundleVisitor = (context) => {
	const { factory } = context;
	const visit: NodeVisit = (node) => {
		// --- Case 1: Strip "export" modifiers ---
		const inside_nameSpace = utilities.isInsideNamespace(node);
		if (!inside_nameSpace) {
			if (
				ts.isFunctionDeclaration(node) ||
				ts.isClassDeclaration(node) ||
				ts.isInterfaceDeclaration(node) ||
				ts.isTypeAliasDeclaration(node) ||
				ts.isEnumDeclaration(node) ||
				ts.isVariableStatement(node)
			) {
				const modifiers = node.modifiers?.filter(
					(m) =>
						m.kind !== ts.SyntaxKind.ExportKeyword &&
						m.kind !== ts.SyntaxKind.DefaultKeyword,
				);
				if (modifiers?.length !== node.modifiers?.length) {
					// If the node has an export modifier, remove it.
					// If the node is a function, class, interface, type alias, enum or variable declaration,
					// update the declaration by removing the export modifier.
					if (ts.isFunctionDeclaration(node)) {
						return factory.updateFunctionDeclaration(
							node,
							modifiers,
							node.asteriskToken,
							node.name,
							node.typeParameters,
							node.parameters,
							node.type,
							node.body,
						);
					} // function
					if (ts.isClassDeclaration(node)) {
						return factory.updateClassDeclaration(
							node,
							modifiers,
							node.name,
							node.typeParameters,
							node.heritageClauses,
							node.members,
						);
					} // class
					if (ts.isInterfaceDeclaration(node)) {
						return factory.updateInterfaceDeclaration(
							node,
							modifiers,
							node.name,
							node.typeParameters,
							node.heritageClauses,
							node.members,
						);
					} // interface
					if (ts.isTypeAliasDeclaration(node)) {
						return factory.updateTypeAliasDeclaration(
							node,
							modifiers,
							node.name,
							node.typeParameters,
							node.type,
						);
					} // types
					if (ts.isEnumDeclaration(node)) {
						return factory.updateEnumDeclaration(
							node,
							modifiers,
							node.name,
							node.members,
						);
					} //enum
					if (ts.isVariableStatement(node)) {
						return factory.updateVariableStatement(
							node,
							modifiers,
							node.declarationList,
						);
					} // vars
				} //--
			} // --- Case 1
		}
		// --- Case 2: Remove "export { foo }" entirely ---
		if (ts.isExportDeclaration(node)) {
			// If the node is an export declaration, remove it.
			return factory.createEmptyStatement();
		}
		// --- Case 3: Handle "export default ..." ---
		if (ts.isExportAssignment(node)) {
			const expr = node.expression;
			// export default Foo;   -> remove line
			if (ts.isIdentifier(expr)) {
				return factory.createEmptyStatement();
			}
		}
		// --------- Visitor Return ------------------//
		return ts.visitEachChild(node, visit, context);
	};
	return visit;
};

export default removeExportsVisitor;
