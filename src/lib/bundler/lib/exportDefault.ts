import ts6 from "@typescript/typescript6";
import type { BundledHandler, DepsFile, NamesSets } from "../../../types.js";
import { utils } from "../../utilities.js";
import { getFileKey, getModuleKeyFromSpecifier } from "./helpers.js";
import { uniqueName } from "./uniqueName.js";

const exportDefaultExportNameMap: NamesSets = [];
const exportDefaultImportNameMap: NamesSets = [];

const exportDefaultPrefixKey = "ExportDefault";

const createExportDefaultNameGenerator = () =>
	uniqueName.setPrefix({
		key: exportDefaultPrefixKey,
		value: "__exportDefault__",
	});

let exportDefaultName = createExportDefaultNameGenerator();

// -----------------------
function exportDefaultCallExpressionHandler(
	compilerOptions: ts6.CompilerOptions,
): BundledHandler {
	return ({ file, content, fileExt, ...rest }: DepsFile): DepsFile => {
		if (fileExt === ".json") return { file, content, fileExt, ...rest };
		const sourceFile = ts6.createSourceFile(
			file,
			content,
			ts6.ScriptTarget.Latest,
			true,
		);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;

			const getMappedName = (base: string) => {
				const mapping = exportDefaultImportNameMap.find(
					(m) => m.base === base && m.file === file,
				);
				return mapping?.newName;
			};

			const isDeclarationName = (node: ts6.Identifier): boolean => {
				const parent = node.parent;

				if (
					(ts6.isVariableDeclaration(parent) ||
						ts6.isFunctionDeclaration(parent) ||
						ts6.isClassDeclaration(parent) ||
						ts6.isParameter(parent) ||
						ts6.isTypeAliasDeclaration(parent) ||
						ts6.isInterfaceDeclaration(parent) ||
						ts6.isEnumDeclaration(parent) ||
						ts6.isImportClause(parent) ||
						ts6.isNamespaceImport(parent) ||
						ts6.isImportSpecifier(parent) ||
						ts6.isExportSpecifier(parent) ||
						ts6.isTypeParameterDeclaration(parent)) &&
					parent.name === node
				) {
					return true;
				}

				if (
					(ts6.isPropertyDeclaration(parent) ||
						ts6.isMethodDeclaration(parent)) &&
					parent.name === node
				) {
					return true;
				}

				return false;
			};

			function visitor(node: ts6.Node): ts6.Node {
				if (ts6.isCallExpression(node)) {
					if (ts6.isIdentifier(node.expression)) {
						const newName = getMappedName(node.expression.text);
						if (newName) {
							return factory.updateCallExpression(
								node,
								factory.createIdentifier(newName),
								node.typeArguments,
								node.arguments,
							);
						}
					}
				} else if (ts6.isPropertyAccessExpression(node)) {
					if (ts6.isIdentifier(node.expression)) {
						const newName = getMappedName(node.expression.text);
						if (newName) {
							return factory.updatePropertyAccessExpression(
								node,
								factory.createIdentifier(newName),
								node.name,
							);
						}
					}
				} else if (ts6.isNewExpression(node)) {
					if (ts6.isIdentifier(node.expression)) {
						const newName = getMappedName(node.expression.text);
						if (newName) {
							return factory.updateNewExpression(
								node,
								factory.createIdentifier(newName),
								node.typeArguments,
								node.arguments,
							);
						}
					}
					// for export specifier it is focus on entry file
				} else if (ts6.isExportSpecifier(node)) {
					if (ts6.isIdentifier(node.name)) {
						const newName = getMappedName(node.name.text);
						if (newName) {
							return factory.updateExportSpecifier(
								node,
								node.isTypeOnly,
								node.propertyName,
								factory.createIdentifier(newName),
							);
						}
					}
				} else if (ts6.isIdentifier(node) && !isDeclarationName(node)) {
					if (
						ts6.isPropertyAccessExpression(node.parent) &&
						node.parent.name === node
					) {
						return node;
					}

					if (
						ts6.isPropertyAssignment(node.parent) &&
						node.parent.name === node
					) {
						return node;
					}

					const newName = getMappedName(node.text);
					if (newName) {
						if (
							ts6.isShorthandPropertyAssignment(node.parent) &&
							node.parent.name === node
						) {
							return factory.createPropertyAssignment(
								factory.createIdentifier(node.text),
								factory.createIdentifier(newName),
							);
						}

						return factory.createIdentifier(newName);
					}
				}
				// return : visitor
				return ts6.visitEachChild(node, visitor, context);
			}
			// return : transform
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		};
		const _content = utils.gen.transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		// return : handler
		return { file, content: _content, fileExt, ...rest } as DepsFile;
	};
}
//--
function exportDefaultExportHandler(
	compilerOptions: ts6.CompilerOptions,
): BundledHandler {
	return ({
		file,
		content,
		fileExt,
		is_entry,
		...rest
	}: DepsFile): DepsFile => {
		if (fileExt === ".json" || is_entry)
			return { file, content, fileExt, is_entry, ...rest };
		const sourceFile = ts6.createSourceFile(
			file,
			content,
			ts6.ScriptTarget.Latest,
			true,
		);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;
			function visitor(node: ts6.Node): ts6.Node {
				const fileName = getFileKey(file);
				if (
					(ts6.isFunctionDeclaration(node) || ts6.isClassDeclaration(node)) &&
					node.name &&
					ts6.isIdentifier(node.name)
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
						const baseName = node.name.text;
						const newName = exportDefaultName.getName(
							exportDefaultPrefixKey,
							baseName,
						);
						exportDefaultExportNameMap.push({
							base: baseName,
							file: fileName,
							newName,
							isEd: true,
						});
						if (ts6.isFunctionDeclaration(node)) {
							return factory.updateFunctionDeclaration(
								node,
								node.modifiers,
								node.asteriskToken,
								factory.createIdentifier(baseName),
								node.typeParameters,
								node.parameters,
								node.type,
								node.body,
							);
						} else if (ts6.isClassDeclaration(node)) {
							return factory.updateClassDeclaration(
								node,
								node.modifiers,
								factory.createIdentifier(baseName),
								node.typeParameters,
								node.heritageClauses,
								node.members,
							);
						}
					} //
				} else if (
					ts6.isExportAssignment(node) &&
					!node.isExportEquals &&
					ts6.isIdentifier(node.expression)
				) {
					const baseName = node.expression.text;
					const newName = exportDefaultName.getName(
						exportDefaultPrefixKey,
						baseName,
					);
					exportDefaultExportNameMap.push({
						base: baseName,
						file: fileName,
						newName,
						isEd: true,
					});
					return factory.updateExportAssignment(
						node,
						node.modifiers,
						factory.createIdentifier(newName),
					);
				} //
				return ts6.visitEachChild(node, visitor, context);
			}
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		};
		const _content = utils.gen.transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, fileExt, is_entry, ...rest };
	};
}
//--
function exportDefaultImportHandler(
	compilerOptions: ts6.CompilerOptions,
): BundledHandler {
	return ({ file, content, fileExt, ...rest }: DepsFile): DepsFile => {
		if (fileExt === ".json") return { file, content, fileExt, ...rest };
		const sourceFile = ts6.createSourceFile(
			file,
			content,
			ts6.ScriptTarget.Latest,
			true,
		);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;
			function visitor(node: ts6.Node): ts6.Node {
				if (ts6.isImportDeclaration(node)) {
					const moduleKey = getModuleKeyFromSpecifier(
						node.moduleSpecifier,
						sourceFile,
						file,
					);
					// check only import default expression
					if (
						node.importClause?.name &&
						ts6.isIdentifier(node.importClause.name)
					) {
						const base = node.importClause.name.text.trim();
						const mapping = exportDefaultExportNameMap.find(
							(v) => v.file === moduleKey,
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
				return ts6.visitEachChild(node, visitor, context);
			}
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		};
		const _content = utils.gen.transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, fileExt, ...rest };
	};
}

function exportDefaultUpdateHandler(
	compilerOptions: ts6.CompilerOptions,
): BundledHandler {
	return ({ file, content, fileExt, ...rest }: DepsFile): DepsFile => {
		if (fileExt === ".json") return { file, content, fileExt, ...rest };
		const sourceFile = ts6.createSourceFile(
			file,
			content,
			ts6.ScriptTarget.Latest,
			true,
		);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;

			const isDeclarationName = (node: ts6.Identifier): boolean => {
				const parent = node.parent;

				if (
					(ts6.isVariableDeclaration(parent) ||
						ts6.isFunctionDeclaration(parent) ||
						ts6.isClassDeclaration(parent) ||
						ts6.isParameter(parent) ||
						ts6.isTypeAliasDeclaration(parent) ||
						ts6.isInterfaceDeclaration(parent) ||
						ts6.isEnumDeclaration(parent) ||
						ts6.isImportClause(parent) ||
						ts6.isNamespaceImport(parent) ||
						ts6.isImportSpecifier(parent) ||
						ts6.isExportSpecifier(parent) ||
						ts6.isTypeParameterDeclaration(parent)) &&
					parent.name === node
				) {
					return true;
				}

				if (
					(ts6.isPropertyDeclaration(parent) ||
						ts6.isMethodDeclaration(parent)) &&
					parent.name === node
				) {
					return true;
				}

				return false;
			};

			function visitor(node: ts6.Node): ts6.Node {
				const _name = getFileKey(file);
				if (exportDefaultExportNameMap.length > 0) {
					const fileMapping = exportDefaultExportNameMap.find(
						(n) => n.file === _name,
					);
					if (fileMapping) {
						if (ts6.isCallExpression(node)) {
							if (
								ts6.isIdentifier(node.expression) &&
								node.expression.text === fileMapping.base
							) {
								return factory.updateCallExpression(
									node,
									factory.createIdentifier(fileMapping.newName),
									node.typeArguments,
									node.arguments,
								);
							}
						} else if (ts6.isPropertyAccessExpression(node)) {
							if (
								ts6.isIdentifier(node.expression) &&
								node.expression.text === fileMapping.base
							) {
								return factory.updatePropertyAccessExpression(
									node,
									factory.createIdentifier(fileMapping.newName),
									node.name,
								);
							}
						} else if (ts6.isNewExpression(node)) {
							if (
								ts6.isIdentifier(node.expression) &&
								node.expression.text === fileMapping.base
							) {
								return factory.updateNewExpression(
									node,
									factory.createIdentifier(fileMapping.newName),
									node.typeArguments,
									node.arguments,
								);
							}
						} else if (
							ts6.isIdentifier(node) &&
							node.text === fileMapping.base &&
							!isDeclarationName(node)
						) {
							if (
								ts6.isPropertyAccessExpression(node.parent) &&
								node.parent.name === node
							) {
								return node;
							}

							if (
								ts6.isPropertyAssignment(node.parent) &&
								node.parent.name === node
							) {
								return node;
							}

							if (
								ts6.isShorthandPropertyAssignment(node.parent) &&
								node.parent.name === node
							) {
								return factory.createPropertyAssignment(
									factory.createIdentifier(node.text),
									factory.createIdentifier(fileMapping.newName),
								);
							}

							return factory.createIdentifier(fileMapping.newName);
						}

						if (
							ts6.isFunctionDeclaration(node) ||
							ts6.isClassDeclaration(node)
						) {
							if (
								node.name &&
								ts6.isIdentifier(node.name) &&
								node.name.text === fileMapping.base
							) {
								if (ts6.isFunctionDeclaration(node)) {
									const visitedNode = ts6.visitEachChild(
										node,
										visitor,
										context,
									) as ts6.FunctionDeclaration;
									return factory.updateFunctionDeclaration(
										visitedNode,
										visitedNode.modifiers,
										visitedNode.asteriskToken,
										factory.createIdentifier(fileMapping.newName),
										visitedNode.typeParameters,
										visitedNode.parameters,
										visitedNode.type,
										visitedNode.body,
									);
								} else if (ts6.isClassDeclaration(node)) {
									const visitedNode = ts6.visitEachChild(
										node,
										visitor,
										context,
									) as ts6.ClassDeclaration;
									return factory.updateClassDeclaration(
										visitedNode,
										visitedNode.modifiers,
										factory.createIdentifier(fileMapping.newName),
										visitedNode.typeParameters,
										visitedNode.heritageClauses,
										visitedNode.members,
									);
								}
							}
						} else if (ts6.isVariableStatement(node)) {
							const declarations = node.declarationList.declarations;
							let changed = false;
							const updatedDeclarations = declarations.map((decl) => {
								if (
									ts6.isIdentifier(decl.name) &&
									decl.name.text === fileMapping.base
								) {
									changed = true;
									return factory.updateVariableDeclaration(
										decl,
										factory.createIdentifier(fileMapping.newName),
										decl.exclamationToken,
										decl.type,
										decl.initializer,
									);
								}
								return decl;
							});
							if (changed) {
								return factory.updateVariableStatement(
									node,
									node.modifiers,
									factory.updateVariableDeclarationList(
										node.declarationList,
										updatedDeclarations,
									),
								);
							}
						}
					}
				}
				// ---------------------------------------------------

				return ts6.visitEachChild(node, visitor, context);
			}
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		};
		const _content = utils.gen.transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, fileExt, ...rest };
	};
}
//--
function resetExportDefaultState() {
	exportDefaultExportNameMap.length = 0;
	exportDefaultImportNameMap.length = 0;
	exportDefaultName = createExportDefaultNameGenerator();
}

const exportDefaultHandler = async (
	deps: DepsFile[],
	compilerOptions: ts6.CompilerOptions,
): Promise<DepsFile[]> => {
	resetExportDefaultState();
	const anonymous = utils.promises.resolve([
		[exportDefaultExportHandler, compilerOptions],
		[exportDefaultImportHandler, compilerOptions],
		[exportDefaultCallExpressionHandler, compilerOptions],
		[exportDefaultUpdateHandler, compilerOptions],
	]);
	const anons = await anonymous.concurrent();
	for (const anon of anons) {
		deps = deps.map(anon);
	}
	return deps;
};

export { exportDefaultHandler };
