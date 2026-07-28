import path from "node:path";
import ts6 from "@typescript/typescript6";
import type { BundledHandler, DepsFile, NamesSets } from "../../../types.js";
import { utils } from "../../utilities.js";
import { createBundledSourceFile, transformBundledSource } from "./helpers.js";
import { uniqueName } from "./uniqueName.js";

const anonymousExportNameMap: NamesSets = [];
const anonymousImportNameMap: NamesSets = [];

const anonymousPrefixKey = "AnonymousName";

const createAnonymousNameGenerator = () =>
	uniqueName.setPrefix({
		key: anonymousPrefixKey,
		value: "__anonymous__",
	});

let anonymousName = createAnonymousNameGenerator();

function anonymousCallExpressionHandler(
	compilerOptions: ts6.CompilerOptions,
): BundledHandler {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
		const sourceFile = createBundledSourceFile(file, content);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;
			function visitor(node: ts6.Node): ts6.Node {
				if (ts6.isCallExpression(node)) {
					if (ts6.isIdentifier(node.expression)) {
						const base = node.expression.text;
						const mapping = anonymousImportNameMap.find(
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
				} else if (ts6.isPropertyAccessExpression(node)) {
					if (ts6.isIdentifier(node.expression)) {
						const base = node.expression.text;
						const mapping = anonymousImportNameMap.find(
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
				} else if (ts6.isNewExpression(node)) {
					if (ts6.isIdentifier(node.expression)) {
						const base = node.expression.text;
						const mapping = anonymousImportNameMap.find(
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
				} else if (ts6.isExportSpecifier(node)) {
					if (ts6.isIdentifier(node.name)) {
						const base = node.name.text;
						const mapping = anonymousImportNameMap.find(
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

				return ts6.visitEachChild(node, visitor, context);
			}
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		};
		const _content = transformBundledSource(
			sourceFile,
			compilerOptions,
			transformer,
		);
		return { file, content: _content, ...rest };
	};
}
//--
function anonymousExportHandler(
	compilerOptions: ts6.CompilerOptions,
): BundledHandler {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
		const sourceFile = createBundledSourceFile(file, content);
		/**
		 * A transformer that handles anonymous default exports by assigning them a name
		 *
		 * @param {ts6.TransformationContext} context - transformation context
		 * @returns {ts6.Transformer<ts6.SourceFile>} - transformer
		 */
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (
			context: ts6.TransformationContext,
		): ts6.Transformer<ts6.SourceFile> => {
			const { factory } = context;
			function visitor(node: ts6.Node): ts6.Node {
				const fileName = path.basename(file).split(".")[0] as string;
				if (
					(ts6.isFunctionDeclaration(node) || ts6.isClassDeclaration(node)) &&
					node.name === undefined
				) {
					let exp = false;
					let def = false;
					node.modifiers?.forEach((mod) => {
						if (mod.kind === ts6.SyntaxKind.ExportKeyword) {
							exp = true;
						}
						if (mod.kind === ts6.SyntaxKind.DefaultKeyword) {
							def = true;
						}
					});
					if (exp && def) {
						const base = anonymousName.getName(anonymousPrefixKey, fileName);
						anonymousExportNameMap.push({
							base,
							file: fileName,
							newName: base,
							isEd: true,
						});
						if (ts6.isFunctionDeclaration(node)) {
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
						} else if (ts6.isClassDeclaration(node)) {
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
					ts6.isExportAssignment(node) &&
					!node.isExportEquals &&
					node.name === undefined
				) {
					if (ts6.isArrowFunction(node.expression)) {
						const base = anonymousName.getName(anonymousPrefixKey, fileName);
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
								ts6.NodeFlags.Const,
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
						anonymousExportNameMap.push({
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
					} else if (ts6.isObjectLiteralExpression(node.expression)) {
						const base = anonymousName.getName(anonymousPrefixKey, fileName);
						const variableDeclarationNode = factory.createVariableDeclaration(
							factory.createIdentifier(base),
							undefined,
							undefined,
							node.expression,
						);
						const variableDeclarationListNode =
							factory.createVariableDeclarationList(
								[variableDeclarationNode],
								ts6.NodeFlags.Const,
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
						anonymousExportNameMap.push({
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
					} else if (ts6.isArrayLiteralExpression(node.expression)) {
						const base = anonymousName.getName(anonymousPrefixKey, fileName);
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
								ts6.NodeFlags.Const,
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
						anonymousExportNameMap.push({
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
					} else if (ts6.isStringLiteral(node.expression)) {
						const base = anonymousName.getName(anonymousPrefixKey, fileName);
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
								ts6.NodeFlags.Const,
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
						anonymousExportNameMap.push({
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
					} else if (ts6.isNumericLiteral(node.expression)) {
						const base = anonymousName.getName(anonymousPrefixKey, fileName);
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
								ts6.NodeFlags.Const,
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
						anonymousExportNameMap.push({
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

				return ts6.visitEachChild(node, visitor, context);
			}
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		};
		const _content = transformBundledSource(
			sourceFile,
			compilerOptions,
			transformer,
		);
		return { file, content: _content, ...rest };
	};
}
//--
function anonymousImportHandler(
	compilerOptions: ts6.CompilerOptions,
): BundledHandler {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
		const sourceFile = createBundledSourceFile(file, content);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;
			function visitor(node: ts6.Node): ts6.Node {
				if (ts6.isImportDeclaration(node)) {
					const fileName = node.moduleSpecifier.getText(sourceFile);
					const _name = (
						path.basename(fileName).split(".")[0] as string
					).trim();
					// check only import default expression
					if (
						node.importClause?.name &&
						ts6.isIdentifier(node.importClause.name)
					) {
						const base = node.importClause.name.text.trim();
						const mapping = anonymousExportNameMap.find(
							(v) => v.file === _name,
						);
						if (mapping) {
							anonymousImportNameMap.push({
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
				return ts6.visitEachChild(node, visitor, context);
			}
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		};
		const _content = transformBundledSource(
			sourceFile,
			compilerOptions,
			transformer,
		);
		return { file, content: _content, ...rest };
	};
}
//--
function resetAnonymousState() {
	anonymousExportNameMap.length = 0;
	anonymousImportNameMap.length = 0;
	anonymousName = createAnonymousNameGenerator();
}
const anonymousHandler = async (
	deps: DepsFile[],
	compilerOptions: ts6.CompilerOptions,
): Promise<DepsFile[]> => {
	resetAnonymousState();
	const anonymous = utils.promises.resolve([
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

export { anonymousHandler };
