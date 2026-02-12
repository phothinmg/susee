import path from "node:path";
import resolves from "@phothinmaung/resolves";
import transformFunction from "@suseejs/transformer";
import type { BundleHandler, DepsFile, NamesSets } from "@suseejs/types";
import ts from "typescript";
import uniqueName from "./uniqueName.js";

const exportDefaultExportNameMap: NamesSets = [];
const exportDefaultImportNameMap: NamesSets = [];

const prefixKey = "AnonymousName";

const genName = uniqueName().setPrefix({
	key: prefixKey,
	value: "__anonymous__",
});

/**
 * A bundle handler that takes a list of source files and transforms them into renamed source files.
 * The transformation is done in a series of steps, each step transforms the source files based on the given maps.
 * The order of the steps is important, as it will determine the final output.
 * @param deps - A list of source files to be transformed.
 * @param compilerOptions - The options for the TypeScript compiler.
 * @returns A list of transformed source files.
 */
function anonymousCallExpressionHandler(
	compilerOptions: ts.CompilerOptions,
): BundleHandler {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const { factory } = context;
			const visitor = (node: ts.Node): ts.Node => {
				if (ts.isCallExpression(node)) {
					if (ts.isIdentifier(node.expression)) {
						const base = node.expression.text;
						const mapping = exportDefaultImportNameMap.find(
							(m) => m.base === base && m.file === file,
						);
						if (mapping) {
							return factory.updateCallExpression(
								node,
								factory.createIdentifier(mapping.newName),
								node.typeArguments,
								node.arguments,
							);
						}
					}
				} else if (ts.isPropertyAccessExpression(node)) {
					if (ts.isIdentifier(node.expression)) {
						const base = node.expression.text;
						const mapping = exportDefaultImportNameMap.find(
							(m) => m.base === base && m.file === file,
						);
						if (mapping) {
							return factory.updatePropertyAccessExpression(
								node,
								factory.createIdentifier(mapping.newName),
								node.name,
							);
						}
					}
				} else if (ts.isNewExpression(node)) {
					if (ts.isIdentifier(node.expression)) {
						const base = node.expression.text;
						const mapping = exportDefaultImportNameMap.find(
							(m) => m.base === base && m.file === file,
						);
						if (mapping) {
							return factory.updateNewExpression(
								node,
								factory.createIdentifier(mapping.newName),
								node.typeArguments,
								node.arguments,
							);
						}
					}
					// for export specifier it is focus on entry file
				} else if (ts.isExportSpecifier(node)) {
					if (ts.isIdentifier(node.name)) {
						const base = node.name.text;
						const mapping = exportDefaultImportNameMap.find(
							(m) => m.base === base && m.file === file,
						);
						if (mapping) {
							return factory.updateExportSpecifier(
								node,
								node.isTypeOnly,
								node.propertyName,
								factory.createIdentifier(mapping.newName),
							);
						}
					}
				}

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

/**
 * A transformer that handles anonymous default exports by assigning them a name
 *
 * @param {ts.TransformationContext} context - transformation context
 * @returns {ts.Transformer<ts.SourceFile>} - transformer
 */
function anonymousExportHandler(
	compilerOptions: ts.CompilerOptions,
): BundleHandler {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
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

/**
 * A bundle handler that takes a list of source files and transforms them into renamed source files.
 * The transformation is done in a series of steps, each step transforms the source files based on the given maps.
 * The order of the steps is important, as it will determine the final output.
 * @param compilerOptions - The options for the TypeScript compiler.
 * @returns A list of transformed source files.
 */
function anonymousImportHandler(
	compilerOptions: ts.CompilerOptions,
): BundleHandler {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const { factory } = context;
			const visitor = (node: ts.Node): ts.Node => {
				if (ts.isImportDeclaration(node)) {
					const fileName = node.moduleSpecifier.getText(sourceFile);
					const _name = (
						path.basename(fileName).split(".")[0] as string
					).trim();
					// check only import default expression
					if (
						node.importClause?.name &&
						ts.isIdentifier(node.importClause.name)
					) {
						const base = node.importClause.name.text.trim();
						const mapping = exportDefaultExportNameMap.find(
							(v) => v.file === _name,
						);
						if (mapping) {
							exportDefaultImportNameMap.push({
								base,
								file,
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

/**
 * A bundle handler that takes a list of source files and transforms them into renamed source files.
 * The transformation is done in a series of steps, each step transforms the source files based on the given maps.
 * The order of the steps is important, as it will determine the final output.
 * @param deps - A list of source files to be transformed.
 * @param compilerOptions - The options for the TypeScript compiler.
 * @returns A list of transformed source files.
 */
const anonymousHandler = async (
	deps: DepsFile[],
	compilerOptions: ts.CompilerOptions,
): Promise<DepsFile[]> => {
	const anonymous = resolves([
		[anonymousExportHandler, compilerOptions],
		[anonymousImportHandler, compilerOptions],
		[anonymousCallExpressionHandler, compilerOptions],
	]);
	const anons = await anonymous.concurrent();
	for (const anon of anons) {
		deps = deps.map(anon);
	}
	return deps;
};

export default anonymousHandler;
