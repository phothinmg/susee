import path from "node:path";
import transformFunction from "susee-transform";
import type { BundleHandler, DependenciesFile, NamesSets } from "susee-types";
import ts from "typescript";
import { promiseResolve } from "./promiseResolve.js";

import { uniqueName } from "./visitors/uniqueName.js";

const exportDefaultExportNameMap: NamesSets = [];
const exportDefaultImportNameMap: NamesSets = [];

const exportDefaultPrefixKey = "ExportDefault";

const normalizePathKey = (filePath: string) => {
	const parsed = path.parse(filePath);
	let noExt = path.join(parsed.dir, parsed.name);
	if (parsed.name === "index") {
		noExt = parsed.dir;
	}
	return path.normalize(noExt);
};

const getFileKey = (filePath: string) => normalizePathKey(filePath);

const getModuleKeyFromSpecifier = (
	moduleSpecifier: ts.Expression,
	sourceFile: ts.SourceFile,
	containingFile: string,
) => {
	let spec = "";
	if (ts.isStringLiteral(moduleSpecifier)) {
		spec = moduleSpecifier.text;
	} else {
		spec = moduleSpecifier.getText(sourceFile).replace(/^['"]|['"]$/g, "");
	}
	if (spec.startsWith(".") || spec.startsWith("/")) {
		const baseDir = path.dirname(containingFile);
		return normalizePathKey(path.resolve(baseDir, spec));
	}
	return spec;
};

const createExportDefaultNameGenerator = () =>
	uniqueName.setPrefix({
		key: exportDefaultPrefixKey,
		value: "__exportDefault__",
	});

let exportDefaultName = createExportDefaultNameGenerator();

function exportDefaultCallExpressionHandler(
	compilerOptions: ts.CompilerOptions,
): BundleHandler {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const { factory } = context;

			const getMappedName = (base: string) => {
				const mapping = exportDefaultImportNameMap.find(
					(m) => m.base === base && m.file === file,
				);
				return mapping?.newName;
			};

			const isDeclarationName = (node: ts.Identifier): boolean => {
				const parent = node.parent;

				if (
					(ts.isVariableDeclaration(parent) ||
						ts.isFunctionDeclaration(parent) ||
						ts.isClassDeclaration(parent) ||
						ts.isParameter(parent) ||
						ts.isTypeAliasDeclaration(parent) ||
						ts.isInterfaceDeclaration(parent) ||
						ts.isEnumDeclaration(parent) ||
						ts.isImportClause(parent) ||
						ts.isNamespaceImport(parent) ||
						ts.isImportSpecifier(parent) ||
						ts.isExportSpecifier(parent) ||
						ts.isTypeParameterDeclaration(parent)) &&
					parent.name === node
				) {
					return true;
				}

				if (
					(ts.isPropertyDeclaration(parent) ||
						ts.isMethodDeclaration(parent)) &&
					parent.name === node
				) {
					return true;
				}

				return false;
			};

			function visitor(node: ts.Node): ts.Node {
				if (ts.isCallExpression(node)) {
					if (ts.isIdentifier(node.expression)) {
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
				} else if (ts.isPropertyAccessExpression(node)) {
					if (ts.isIdentifier(node.expression)) {
						const newName = getMappedName(node.expression.text);
						if (newName) {
							return factory.updatePropertyAccessExpression(
								node,
								factory.createIdentifier(newName),
								node.name,
							);
						}
					}
				} else if (ts.isNewExpression(node)) {
					if (ts.isIdentifier(node.expression)) {
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
				} else if (ts.isExportSpecifier(node)) {
					if (ts.isIdentifier(node.name)) {
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
				} else if (ts.isIdentifier(node) && !isDeclarationName(node)) {
					if (
						ts.isPropertyAccessExpression(node.parent) &&
						node.parent.name === node
					) {
						return node;
					}

					if (
						ts.isPropertyAssignment(node.parent) &&
						node.parent.name === node
					) {
						return node;
					}

					const newName = getMappedName(node.text);
					if (newName) {
						if (
							ts.isShorthandPropertyAssignment(node.parent) &&
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

				return ts.visitEachChild(node, visitor, context);
			}
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

function exportDefaultExportHandler(
	compilerOptions: ts.CompilerOptions,
): BundleHandler {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const { factory } = context;
			function visitor(node: ts.Node): ts.Node {
				const fileName = getFileKey(file);
				if (
					(ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
					node.name &&
					ts.isIdentifier(node.name)
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
						if (ts.isFunctionDeclaration(node)) {
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
						} else if (ts.isClassDeclaration(node)) {
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
					ts.isExportAssignment(node) &&
					!node.isExportEquals &&
					ts.isIdentifier(node.expression)
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
				return ts.visitEachChild(node, visitor, context);
			}
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

function exportDefaultImportHandler(
	compilerOptions: ts.CompilerOptions,
): BundleHandler {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const { factory } = context;
			function visitor(node: ts.Node): ts.Node {
				if (ts.isImportDeclaration(node)) {
					const moduleKey = getModuleKeyFromSpecifier(
						node.moduleSpecifier,
						sourceFile,
						file,
					);
					// check only import default expression
					if (
						node.importClause?.name &&
						ts.isIdentifier(node.importClause.name)
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
				return ts.visitEachChild(node, visitor, context);
			}
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

function exportDefaultUpdateHandler(
	compilerOptions: ts.CompilerOptions,
): BundleHandler {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const { factory } = context;
			function visitor(node: ts.Node): ts.Node {
				const _name = getFileKey(file);
				if (exportDefaultExportNameMap.length > 0) {
					const fileMapping = exportDefaultExportNameMap.find(
						(n) => n.file === _name,
					);
					if (fileMapping) {
						if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
							if (
								node.name &&
								ts.isIdentifier(node.name) &&
								node.name.text === fileMapping.base
							) {
								if (ts.isFunctionDeclaration(node)) {
									return factory.updateFunctionDeclaration(
										node,
										node.modifiers,
										node.asteriskToken,
										factory.createIdentifier(fileMapping.newName),
										node.typeParameters,
										node.parameters,
										node.type,
										node.body,
									);
								} else if (ts.isClassDeclaration(node)) {
									return factory.updateClassDeclaration(
										node,
										node.modifiers,
										factory.createIdentifier(fileMapping.newName),
										node.typeParameters,
										node.heritageClauses,
										node.members,
									);
								}
							}
						} else if (ts.isVariableStatement(node)) {
							const declarations = node.declarationList.declarations;
							let changed = false;
							const updatedDeclarations = declarations.map((decl) => {
								if (
									ts.isIdentifier(decl.name) &&
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

				return ts.visitEachChild(node, visitor, context);
			}
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

function resetState() {
	exportDefaultExportNameMap.length = 0;
	exportDefaultImportNameMap.length = 0;
	exportDefaultName = createExportDefaultNameGenerator();
}

const exportDefaultHandler = async (
	deps: DependenciesFile[],
	compilerOptions: ts.CompilerOptions,
): Promise<DependenciesFile[]> => {
	resetState();
	const anonymous = promiseResolve([
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
