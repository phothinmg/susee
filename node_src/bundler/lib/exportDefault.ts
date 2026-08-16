import ts6 from "@suseejs/ts6";
import type { BundledHandler, DepsFile, NamesSets } from "@suseejs/type";
import {
	createBundledSourceFile,
	getFileKey,
	getModuleKeyFromSpecifier,
	transformBundledSource,
} from "./helpers.js";
import { uniqueName } from "./uniqueName.js";

const exportDefaultExportNameMap: NamesSets = [];
const exportDefaultImportNameMap: NamesSets = [];

const exportDefaultPrefixKey = "ExportDefault";

const createExportDefaultNameGenerator = () =>
	uniqueName.setPrefix({
		key: exportDefaultPrefixKey,
		value: "susee__exportDefault__",
	});

let exportDefaultName = createExportDefaultNameGenerator();

const toNameLookupKey = (file: string, base: string) => `${file}\u0000${base}`;

const createNameLookup = (sets: NamesSets) => {
	const lookup = new Map<string, string>();
	for (const set of sets) {
		lookup.set(toNameLookupKey(set.file, set.base), set.newName);
	}
	return lookup;
};

const getMappedName = (
	lookup: Map<string, string>,
	file: string,
	base: string,
) => {
	return lookup.get(toNameLookupKey(file, base));
};

const hasExportDefaultModifiers = (node: {
	modifiers?: ts6.NodeArray<ts6.ModifierLike>;
}) => {
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
	return exp && def;
};

const collectExportDefaultMappings = (deps: DepsFile[]) => {
	for (const dep of deps) {
		if (dep.fileExt === ".json" || dep.is_entry) {
			continue;
		}
		const fileKey = getFileKey(dep.file);
		const sourceFile = createBundledSourceFile(dep.file, dep.content);
		for (const statement of sourceFile.statements) {
			if (
				(ts6.isFunctionDeclaration(statement) ||
					ts6.isClassDeclaration(statement)) &&
				statement.name &&
				ts6.isIdentifier(statement.name) &&
				hasExportDefaultModifiers(statement)
			) {
				const baseName = statement.name.text;
				const newName = exportDefaultName.getName(
					exportDefaultPrefixKey,
					baseName,
				);
				exportDefaultExportNameMap.push({
					base: baseName,
					file: fileKey,
					newName,
					isEd: true,
				});
				break;
			}

			if (
				ts6.isExportAssignment(statement) &&
				!statement.isExportEquals &&
				ts6.isIdentifier(statement.expression)
			) {
				const baseName = statement.expression.text;
				const newName = exportDefaultName.getName(
					exportDefaultPrefixKey,
					baseName,
				);
				exportDefaultExportNameMap.push({
					base: baseName,
					file: fileKey,
					newName,
					isEd: true,
				});
				break;
			}
		}
	}
};

// -----------------------
function exportDefaultImportAndUsageHandler(
	compilerOptions: ts6.CompilerOptions,
): BundledHandler {
	return ({ file, content, fileExt, ...rest }: DepsFile): DepsFile => {
		if (fileExt === ".json") return { file, content, fileExt, ...rest };
		const sourceFile = createBundledSourceFile(file, content);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;
			const exportLookup = createNameLookup(exportDefaultExportNameMap);
			const importLookup = new Map<string, string>();

			const resolveMappedName = (base: string) => importLookup.get(base);

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
				if (ts6.isImportDeclaration(node)) {
					const moduleKey = getModuleKeyFromSpecifier(
						node.moduleSpecifier,
						sourceFile,
						file,
					);
					if (
						node.importClause?.name &&
						ts6.isIdentifier(node.importClause.name)
					) {
						const base = node.importClause.name.text.trim();
						const mappedName = getMappedName(exportLookup, moduleKey, base);
						if (mappedName) {
							importLookup.set(base, mappedName);
							exportDefaultImportNameMap.push({
								base,
								file,
								newName: mappedName,
								isEd: true,
							});
							const newImportClause = factory.updateImportClause(
								node.importClause,
								node.importClause.phaseModifier,
								factory.createIdentifier(mappedName),
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

				if (ts6.isCallExpression(node)) {
					if (ts6.isIdentifier(node.expression)) {
						const newName = resolveMappedName(node.expression.text);
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
						const newName = resolveMappedName(node.expression.text);
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
						const newName = resolveMappedName(node.expression.text);
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
						const newName = resolveMappedName(node.name.text);
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

					const newName = resolveMappedName(node.text);
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
		const _content = transformBundledSource(
			sourceFile,
			compilerOptions,
			transformer,
		);
		// return : handler
		return { file, content: _content, fileExt, ...rest } as DepsFile;
	};
}
//--
function exportDefaultLocalHandler(
	compilerOptions: ts6.CompilerOptions,
): BundledHandler {
	return ({
		file,
		content,
		fileExt,
		is_entry,
		...rest
	}: DepsFile): DepsFile => {
		if (fileExt === ".json")
			return { file, content, fileExt, is_entry, ...rest };
		const fileName = getFileKey(file);
		// const exportLookup = createNameLookup(exportDefaultExportNameMap);
		// const mappedName = getMappedName(exportLookup, fileName, fileName);
		const localMapping = exportDefaultExportNameMap.find(
			(n) => n.file === fileName,
		);
		if (is_entry || !localMapping)
			return { file, content, fileExt, is_entry, ...rest };
		const sourceFile = createBundledSourceFile(file, content);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;
			const { base: baseName, newName } = localMapping;

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
				if (
					ts6.isExportAssignment(node) &&
					!node.isExportEquals &&
					ts6.isIdentifier(node.expression) &&
					node.expression.text === baseName
				) {
					return factory.updateExportAssignment(
						node,
						node.modifiers,
						factory.createIdentifier(newName),
					);
				}

				if (ts6.isCallExpression(node)) {
					if (
						ts6.isIdentifier(node.expression) &&
						node.expression.text === baseName
					) {
						return factory.updateCallExpression(
							node,
							factory.createIdentifier(newName),
							node.typeArguments,
							node.arguments,
						);
					}
				} else if (ts6.isPropertyAccessExpression(node)) {
					if (
						ts6.isIdentifier(node.expression) &&
						node.expression.text === baseName
					) {
						return factory.updatePropertyAccessExpression(
							node,
							factory.createIdentifier(newName),
							node.name,
						);
					}
				} else if (ts6.isNewExpression(node)) {
					if (
						ts6.isIdentifier(node.expression) &&
						node.expression.text === baseName
					) {
						return factory.updateNewExpression(
							node,
							factory.createIdentifier(newName),
							node.typeArguments,
							node.arguments,
						);
					}
				} else if (
					ts6.isIdentifier(node) &&
					node.text === baseName &&
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
							factory.createIdentifier(newName),
						);
					}

					return factory.createIdentifier(newName);
				}

				if (ts6.isFunctionDeclaration(node) || ts6.isClassDeclaration(node)) {
					if (
						node.name &&
						ts6.isIdentifier(node.name) &&
						node.name.text === baseName
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
								factory.createIdentifier(newName),
								visitedNode.typeParameters,
								visitedNode.parameters,
								visitedNode.type,
								visitedNode.body,
							);
						}

						const visitedNode = ts6.visitEachChild(
							node,
							visitor,
							context,
						) as ts6.ClassDeclaration;
						return factory.updateClassDeclaration(
							visitedNode,
							visitedNode.modifiers,
							factory.createIdentifier(newName),
							visitedNode.typeParameters,
							visitedNode.heritageClauses,
							visitedNode.members,
						);
					}
				} else if (ts6.isVariableStatement(node)) {
					const declarations = node.declarationList.declarations;
					let changed = false;
					const updatedDeclarations = declarations.map((decl) => {
						if (ts6.isIdentifier(decl.name) && decl.name.text === baseName) {
							changed = true;
							return factory.updateVariableDeclaration(
								decl,
								factory.createIdentifier(newName),
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

				return ts6.visitEachChild(node, visitor, context);
			}
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		};
		const _content = transformBundledSource(
			sourceFile,
			compilerOptions,
			transformer,
		);
		return { file, content: _content, fileExt, is_entry, ...rest };
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
	collectExportDefaultMappings(deps);
	deps = deps.map(exportDefaultLocalHandler(compilerOptions));
	deps = deps.map(exportDefaultImportAndUsageHandler(compilerOptions));
	return deps;
};

export { exportDefaultHandler };
