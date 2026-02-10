import path from "node:path";
import type { BundleVisitor, NamesSets, NodeVisit } from "@suseejs/types";
import ts from "typescript";
import { uniqueName } from "./visitorHelpers.js";

const prefixKey = "AnonymousName";

const genName = uniqueName().setPrefix({ key: prefixKey, value: "a_" });

/**
 * A BundleVisitor that updates the call expression, property access expression, and new expression
 * with the anonymous default import name.
 */
const anonymousExportVisitor: BundleVisitor = (
	context,
	depsTree,
	sourceFile,
	exportDefaultExportNameMap: NamesSets,
) => {
	const { factory } = context;
	const visit: NodeVisit = (node) => {
		const fileName = path.basename(depsTree.file).split(".")[0] as string;
		if (
			(ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
			node.name === undefined
		) {
			let exp = false;
			let def = false;
			node.modifiers?.forEach((mod) => {
				if (mod.kind === ts.SyntaxKind.ExportKeyword) {
					exp = true;
				}
				if (mod.kind === ts.SyntaxKind.DefaultKeyword) {
					def = true;
				}
			});
			if (exp && def) {
				const base = genName.getName(fileName);
				exportDefaultExportNameMap.push({
					base,
					file: fileName,
					newName: base,
					isEd: true,
				});
				if (ts.isFunctionDeclaration(node)) {
					return factory.updateFunctionDeclaration(
						node,
						node.modifiers,
						node.asteriskToken,
						factory.createIdentifier(base),
						node.typeParameters,
						node.parameters,
						node.type,
						node.body,
					);
				} else if (ts.isClassDeclaration(node)) {
					return factory.updateClassDeclaration(
						node,
						node.modifiers,
						factory.createIdentifier(base),
						node.typeParameters,
						node.heritageClauses,
						node.members,
					);
				}
			}
		} else if (
			ts.isExportAssignment(node) &&
			!node.name &&
			!node.isExportEquals
		) {
			if (ts.isArrowFunction(node.expression)) {
				const base = genName.getName(fileName);
				const arrowFunctionNode = factory.createArrowFunction(
					node.expression.modifiers,
					node.expression.typeParameters,
					node.expression.parameters,
					node.expression.type,
					node.expression.equalsGreaterThanToken,
					node.expression.body,
				);
				const variableDeclarationNode = factory.createVariableDeclaration(
					factory.createIdentifier(base),
					node.expression.exclamationToken,
					node.expression.type,
					arrowFunctionNode,
				);
				const variableDeclarationListNode =
					factory.createVariableDeclarationList(
						[variableDeclarationNode],
						ts.NodeFlags.Const,
					);

				const variableStatementNode = factory.createVariableStatement(
					node.expression.modifiers,
					variableDeclarationListNode,
				);
				const exportAssignmentNode = factory.createExportAssignment(
					undefined,
					undefined,
					factory.createIdentifier(base),
				);
				exportDefaultExportNameMap.push({
					base,
					file: fileName,
					newName: base,
					isEd: true,
				});
				return factory.updateSourceFile(
					sourceFile,
					[variableStatementNode, exportAssignmentNode],
					sourceFile.isDeclarationFile,
					sourceFile.referencedFiles,
					sourceFile.typeReferenceDirectives,
					sourceFile.hasNoDefaultLib,
					sourceFile.libReferenceDirectives,
				);
			} else if (ts.isObjectLiteralExpression(node.expression)) {
				const base = genName.getName(fileName);
				const variableDeclarationNode = factory.createVariableDeclaration(
					factory.createIdentifier(base),
					undefined,
					undefined,
					node.expression,
				);
				const variableDeclarationListNode =
					factory.createVariableDeclarationList(
						[variableDeclarationNode],
						ts.NodeFlags.Const,
					);

				const variableStatementNode = factory.createVariableStatement(
					undefined,
					variableDeclarationListNode,
				);
				const exportAssignmentNode = factory.createExportAssignment(
					undefined,
					undefined,
					factory.createIdentifier(base),
				);
				exportDefaultExportNameMap.push({
					base,
					file: fileName,
					newName: base,
					isEd: true,
				});
				return factory.updateSourceFile(
					sourceFile,
					[variableStatementNode, exportAssignmentNode],
					sourceFile.isDeclarationFile,
					sourceFile.referencedFiles,
					sourceFile.typeReferenceDirectives,
					sourceFile.hasNoDefaultLib,
					sourceFile.libReferenceDirectives,
				);
			} else if (ts.isArrayLiteralExpression(node.expression)) {
				const base = genName.getName(fileName);
				const arrayLiteralExpressionNode = factory.createArrayLiteralExpression(
					node.expression.elements,
					true,
				);
				const variableDeclarationNode = factory.createVariableDeclaration(
					factory.createIdentifier(base),
					undefined,
					undefined,
					arrayLiteralExpressionNode,
				);
				const variableDeclarationListNode =
					factory.createVariableDeclarationList(
						[variableDeclarationNode],
						ts.NodeFlags.Const,
					);

				const variableStatementNode = factory.createVariableStatement(
					undefined,
					variableDeclarationListNode,
				);
				const exportAssignmentNode = factory.createExportAssignment(
					undefined,
					undefined,
					factory.createIdentifier(base),
				);
				exportDefaultExportNameMap.push({
					base,
					file: fileName,
					newName: base,
					isEd: true,
				});
				return factory.updateSourceFile(
					sourceFile,
					[variableStatementNode, exportAssignmentNode],
					sourceFile.isDeclarationFile,
					sourceFile.referencedFiles,
					sourceFile.typeReferenceDirectives,
					sourceFile.hasNoDefaultLib,
					sourceFile.libReferenceDirectives,
				);
			} else if (ts.isStringLiteral(node.expression)) {
				const base = genName.getName(fileName);
				const stringLiteralNode = factory.createStringLiteral(
					node.expression.text,
				);
				const variableDeclarationNode = factory.createVariableDeclaration(
					factory.createIdentifier(base),
					undefined,
					undefined,
					stringLiteralNode,
				);
				const variableDeclarationListNode =
					factory.createVariableDeclarationList(
						[variableDeclarationNode],
						ts.NodeFlags.Const,
					);

				const variableStatementNode = factory.createVariableStatement(
					undefined,
					variableDeclarationListNode,
				);
				const exportAssignmentNode = factory.createExportAssignment(
					undefined,
					undefined,
					factory.createIdentifier(base),
				);
				exportDefaultExportNameMap.push({
					base,
					file: fileName,
					newName: base,
					isEd: true,
				});
				return factory.updateSourceFile(
					sourceFile,
					[variableStatementNode, exportAssignmentNode],
					sourceFile.isDeclarationFile,
					sourceFile.referencedFiles,
					sourceFile.typeReferenceDirectives,
					sourceFile.hasNoDefaultLib,
					sourceFile.libReferenceDirectives,
				);
			} else if (ts.isNumericLiteral(node.expression)) {
				const base = genName.getName(fileName);
				const numericLiteralNode = factory.createNumericLiteral(
					node.expression.text,
				);
				const variableDeclarationNode = factory.createVariableDeclaration(
					factory.createIdentifier(base),
					undefined,
					undefined,
					numericLiteralNode,
				);
				const variableDeclarationListNode =
					factory.createVariableDeclarationList(
						[variableDeclarationNode],
						ts.NodeFlags.Const,
					);

				const variableStatementNode = factory.createVariableStatement(
					undefined,
					variableDeclarationListNode,
				);
				const exportAssignmentNode = factory.createExportAssignment(
					undefined,
					undefined,
					factory.createIdentifier(base),
				);
				exportDefaultExportNameMap.push({
					base,
					file: fileName,
					newName: base,
					isEd: true,
				});
				return factory.updateSourceFile(
					sourceFile,
					[variableStatementNode, exportAssignmentNode],
					sourceFile.isDeclarationFile,
					sourceFile.referencedFiles,
					sourceFile.typeReferenceDirectives,
					sourceFile.hasNoDefaultLib,
					sourceFile.libReferenceDirectives,
				);
			}
		} //

		return ts.visitEachChild(node, visit, context);
	};
	return visit;
};

export default anonymousExportVisitor;
