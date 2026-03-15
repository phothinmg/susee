import path from "node:path";
import transformFunction from "@suseejs/transformer";
import type {
	BundleHandler,
	DependenciesFile,
	NamesSets,
} from "@suseejs/types";
import utils from "@suseejs/utils";
import ts from "typescript";

const prefixKey = "AnonymousName";

const genName = utils.uniqueName().setPrefix({
	key: prefixKey,
	value: "__anonymous__",
});

function anonymousExportHandler(
	compilerOptions: ts.CompilerOptions,
	exportDefaultExportNameMap: NamesSets,
): BundleHandler {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		/**
		 * A transformer that handles anonymous default exports by assigning them a name
		 *
		 * @param {ts.TransformationContext} context - transformation context
		 * @returns {ts.Transformer<ts.SourceFile>} - transformer
		 */
		const transformer: ts.TransformerFactory<ts.SourceFile> = (
			context: ts.TransformationContext,
		): ts.Transformer<ts.SourceFile> => {
			const { factory } = context;
			/**
			 * Visitor that handles anonymous default exports by assigning them a name
			 *
			 * @param {ts.Node} node - node to visit
			 * @returns {ts.Node} - transformed node
			 */
			const visitor = (node: ts.Node): ts.Node => {
				const fileName = path.basename(file).split(".")[0] as string;
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
						const base = genName.getName(prefixKey, fileName);
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
						const base = genName.getName(prefixKey, fileName);
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
						const base = genName.getName(prefixKey, fileName);
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
						const base = genName.getName(prefixKey, fileName);
						const arrayLiteralExpressionNode =
							factory.createArrayLiteralExpression(
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
						const base = genName.getName(prefixKey, fileName);
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
						const base = genName.getName(prefixKey, fileName);
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

				return ts.visitEachChild(node, visitor, context);
			};
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		};
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, ...rest };
	};
}

export default anonymousExportHandler;
