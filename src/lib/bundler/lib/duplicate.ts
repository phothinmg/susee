// cSpell:disable

import ts6 from "@typescript/typescript6";
import type {
	BundledHandler,
	DepsFile,
	DuplicatesNameMap,
	NamesSets,
} from "../../../types.js";
import {
	createBundledSourceFile,
	getFileKey,
	getModuleKeyFromSpecifier,
	transformBundledSource,
} from "./helpers.js";
import { uniqueName } from "./uniqueName.js";

// construct maps
const callNameMap: NamesSets = [];
const importNameMap: NamesSets = [];
const exportNameMap: NamesSets = [];
const duplicateNameMap: DuplicatesNameMap = new Map();

const duplicatePrefixKey = "DuplicatesNames";

const createDuplicateNameGenerator = () =>
	uniqueName.setPrefix({
		key: duplicatePrefixKey,
		value: "__duplicatesNames__",
	});

let duplicateName = createDuplicateNameGenerator();

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
	return lookup.get(toNameLookupKey(file, base)) ?? null;
};

const isFunctionLikeScope = (node: ts6.Node) =>
	ts6.isFunctionDeclaration(node) ||
	ts6.isFunctionExpression(node) ||
	ts6.isArrowFunction(node) ||
	ts6.isMethodDeclaration(node) ||
	ts6.isConstructorDeclaration(node) ||
	ts6.isGetAccessorDeclaration(node) ||
	ts6.isSetAccessorDeclaration(node);

const isScopeBoundary = (node: ts6.Node) =>
	ts6.isSourceFile(node) ||
	ts6.isBlock(node) ||
	ts6.isModuleBlock(node) ||
	isFunctionLikeScope(node);

const collectBindingNames = (name: ts6.BindingName, names: Set<string>) => {
	if (ts6.isIdentifier(name)) {
		names.add(name.text);
		return;
	}

	for (const element of name.elements) {
		if (ts6.isOmittedExpression(element)) {
			continue;
		}

		collectBindingNames(element.name, names);
	}
};

const collectDirectScopeDeclarations = (node: ts6.Node, names: Set<string>) => {
	const visit = (child: ts6.Node) => {
		if (ts6.isVariableStatement(child)) {
			for (const declaration of child.declarationList.declarations) {
				collectBindingNames(declaration.name, names);
			}
			return;
		}

		if (
			ts6.isFunctionDeclaration(child) ||
			ts6.isClassDeclaration(child) ||
			ts6.isEnumDeclaration(child) ||
			ts6.isInterfaceDeclaration(child) ||
			ts6.isTypeAliasDeclaration(child) ||
			ts6.isModuleDeclaration(child)
		) {
			if (child.name) {
				names.add(child.name.text);
			}
			return;
		}

		if (isScopeBoundary(child)) {
			return;
		}

		ts6.forEachChild(child, visit);
	};

	ts6.forEachChild(node, visit);
};

const collectFunctionScopedDeclarations = (
	node: ts6.Node,
	names: Set<string>,
) => {
	if (
		!(
			ts6.isFunctionDeclaration(node) ||
			ts6.isFunctionExpression(node) ||
			ts6.isArrowFunction(node) ||
			ts6.isMethodDeclaration(node) ||
			ts6.isConstructorDeclaration(node) ||
			ts6.isGetAccessorDeclaration(node) ||
			ts6.isSetAccessorDeclaration(node)
		)
	) {
		return;
	}

	if (
		node.name &&
		ts6.isIdentifier(node.name) &&
		(ts6.isFunctionDeclaration(node) || ts6.isFunctionExpression(node))
	) {
		names.add(node.name.text);
	}

	for (const parameter of node.parameters) {
		collectBindingNames(parameter.name, names);
	}

	const body = node.body;
	if (!body) {
		return;
	}

	const visitVarScoped = (child: ts6.Node) => {
		if (
			child !== body &&
			(ts6.isFunctionDeclaration(child) ||
				ts6.isFunctionExpression(child) ||
				ts6.isArrowFunction(child) ||
				ts6.isMethodDeclaration(child) ||
				ts6.isConstructorDeclaration(child) ||
				ts6.isGetAccessorDeclaration(child) ||
				ts6.isSetAccessorDeclaration(child) ||
				ts6.isModuleBlock(child))
		) {
			return;
		}

		if (ts6.isVariableDeclaration(child)) {
			const declarationList = child.parent;
			const variableStatement = declarationList.parent;
			if (
				ts6.isVariableDeclarationList(declarationList) &&
				ts6.isVariableStatement(variableStatement) &&
				(declarationList.flags & ts6.NodeFlags.BlockScoped) === 0
			) {
				collectBindingNames(child.name, names);
			}
		}

		ts6.forEachChild(child, visitVarScoped);
	};

	visitVarScoped(body);
};

const createShadowedNames = (
	node: ts6.Node,
	parentShadowedNames: Set<string>,
) => {
	if (ts6.isSourceFile(node)) {
		return parentShadowedNames;
	}

	if (isFunctionLikeScope(node)) {
		const scopeNames = new Set(parentShadowedNames);
		collectFunctionScopedDeclarations(node, scopeNames);
		return scopeNames;
	}

	if (ts6.isBlock(node) || ts6.isModuleBlock(node)) {
		const scopeNames = new Set(parentShadowedNames);
		collectDirectScopeDeclarations(node, scopeNames);
		return scopeNames;
	}

	return parentShadowedNames;
};

const isTopLevelNode = (node: ts6.Node) => ts6.isSourceFile(node.parent);

const duplicateUsageAndExportHandler = (
	compilerOptions: ts6.CompilerOptions,
): BundledHandler => {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
		const sourceFile = createBundledSourceFile(file, content);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;
			const fileKey = getFileKey(file);
			const callLookup = createNameLookup(callNameMap);
			const importLookup = createNameLookup(importNameMap);
			const resolveMappedEntry = (base: string) => {
				const callMappedName = getMappedName(callLookup, file, base);
				if (callMappedName) {
					return { newName: callMappedName, isCallMapping: true };
				}

				const importMappedName = getMappedName(importLookup, file, base);
				if (importMappedName) {
					return { newName: importMappedName, isCallMapping: false };
				}

				return null;
			};

			const isDeclarationName = (node: ts6.Identifier) => {
				const parent = node.parent;

				if (!parent) {
					return false;
				}

				if (
					(ts6.isVariableDeclaration(parent) && parent.name === node) ||
					((ts6.isFunctionDeclaration(parent) ||
						ts6.isClassDeclaration(parent) ||
						ts6.isInterfaceDeclaration(parent) ||
						ts6.isTypeAliasDeclaration(parent) ||
						ts6.isEnumDeclaration(parent) ||
						ts6.isParameter(parent) ||
						ts6.isBindingElement(parent) ||
						ts6.isImportClause(parent) ||
						ts6.isNamespaceImport(parent) ||
						ts6.isImportSpecifier(parent) ||
						ts6.isExportSpecifier(parent) ||
						ts6.isTypeParameterDeclaration(parent)) &&
						parent.name === node)
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

			const visitor = (
				node: ts6.Node,
				shadowedNames: Set<string>,
			): ts6.Node => {
				const nextShadowedNames = createShadowedNames(node, shadowedNames);

				if (ts6.isCallExpression(node)) {
					if (ts6.isIdentifier(node.expression)) {
						if (nextShadowedNames.has(node.expression.text)) {
							return ts6.visitEachChild(
								node,
								(child) => visitor(child, nextShadowedNames),
								context,
							);
						}

						const mappedEntry = resolveMappedEntry(node.expression.text);
						if (mappedEntry) {
							return factory.updateCallExpression(
								node,
								factory.createIdentifier(mappedEntry.newName),
								node.typeArguments,
								node.arguments,
							);
						}
					}
				} else if (ts6.isPropertyAccessExpression(node)) {
					if (ts6.isIdentifier(node.expression)) {
						if (nextShadowedNames.has(node.expression.text)) {
							return ts6.visitEachChild(
								node,
								(child) => visitor(child, nextShadowedNames),
								context,
							);
						}

						const mappedEntry = resolveMappedEntry(node.expression.text);
						if (mappedEntry) {
							return factory.updatePropertyAccessExpression(
								node,
								factory.createIdentifier(mappedEntry.newName),
								node.name,
							);
						}
					}
				} else if (ts6.isNewExpression(node)) {
					if (ts6.isIdentifier(node.expression)) {
						if (nextShadowedNames.has(node.expression.text)) {
							return ts6.visitEachChild(
								node,
								(child) => visitor(child, nextShadowedNames),
								context,
							);
						}

						const mappedEntry = resolveMappedEntry(node.expression.text);
						if (mappedEntry) {
							return factory.updateNewExpression(
								node,
								factory.createIdentifier(mappedEntry.newName),
								node.typeArguments,
								node.arguments,
							);
						}
					}
				} else if (ts6.isExportSpecifier(node)) {
					if (ts6.isIdentifier(node.name)) {
						const mappedEntry = resolveMappedEntry(node.name.text);
						if (mappedEntry?.isCallMapping) {
							exportNameMap.push({
								base: node.name.text,
								file: fileKey,
								newName: mappedEntry.newName,
							});
						}
						if (mappedEntry) {
							return factory.updateExportSpecifier(
								node,
								node.isTypeOnly,
								node.propertyName,
								factory.createIdentifier(mappedEntry.newName),
							);
						}
					}
				} else if (ts6.isExportAssignment(node)) {
					const expr = node.expression;
					if (ts6.isIdentifier(expr)) {
						const mappedEntry = resolveMappedEntry(expr.text);
						if (mappedEntry?.isCallMapping) {
							exportNameMap.push({
								base: expr.text,
								file: fileKey,
								newName: mappedEntry.newName,
							});
						}
						if (mappedEntry) {
							return factory.updateExportAssignment(
								node,
								node.modifiers,
								factory.createIdentifier(mappedEntry.newName),
							);
						}
					}
				} else if (ts6.isIdentifier(node) && !isDeclarationName(node)) {
					if (nextShadowedNames.has(node.text)) {
						return node;
					}

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

					const mappedEntry = resolveMappedEntry(node.text);
					if (mappedEntry) {
						if (
							ts6.isShorthandPropertyAssignment(node.parent) &&
							node.parent.name === node
						) {
							return factory.createPropertyAssignment(
								factory.createIdentifier(node.text),
								factory.createIdentifier(mappedEntry.newName),
							);
						}

						return factory.createIdentifier(mappedEntry.newName);
					}
				}
				/* ----------------------Returns for visitor function------------------------------- */
				return ts6.visitEachChild(
					node,
					(child) => visitor(child, nextShadowedNames),
					context,
				);
			}; // visitor;
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) =>
				ts6.visitNode(rootNode, (node) =>
					visitor(node, new Set()),
				) as ts6.SourceFile;
		}; // transformer;
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformBundledSource(
			sourceFile,
			compilerOptions,
			transformer,
		);
		return { file, content: _content, ...rest };
	}; // returns
};
//--
const duplicateImportExpression = (
	compilerOptions: ts6.CompilerOptions,
): BundledHandler => {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
		const sourceFile = createBundledSourceFile(file, content);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;
			const exportLookup = createNameLookup(exportNameMap);
			const visitor = (node: ts6.Node): ts6.Node => {
				if (ts6.isImportDeclaration(node)) {
					const moduleKey = getModuleKeyFromSpecifier(
						node.moduleSpecifier,
						sourceFile,
						file,
					);
					let baseNames: string[] = [];
					if (
						node.importClause?.namedBindings &&
						ts6.isNamedImports(node.importClause.namedBindings)
					) {
						baseNames = node.importClause.namedBindings.elements.map((el) =>
							el.name.text.trim(),
						);
					}
					// import default expression
					if (
						node.importClause?.name &&
						ts6.isIdentifier(node.importClause.name)
					) {
						const base = node.importClause.name.text.trim();
						const mapping = getMappedName(exportLookup, moduleKey, base);
						if (mapping) {
							importNameMap.push({
								base,
								file,
								newName: mapping,
							});
							const newImportClause = factory.updateImportClause(
								node.importClause,
								node.importClause.phaseModifier,
								factory.createIdentifier(mapping),
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
					// import name , `import{ ... }`
					if (
						baseNames.length > 0 &&
						node.importClause &&
						node.importClause.namedBindings &&
						ts6.isNamedImports(node.importClause.namedBindings)
					) {
						const updatedElements =
							node.importClause.namedBindings.elements.map((el) => {
								const base = el.name.text.trim();
								const mapping = getMappedName(exportLookup, moduleKey, base);

								if (mapping) {
									importNameMap.push({
										base,
										file,
										newName: mapping,
									});
									return factory.updateImportSpecifier(
										el,
										el.isTypeOnly,
										el.propertyName,
										factory.createIdentifier(mapping),
									);
								}
								return el;
							});
						const newNamedImports = factory.updateNamedImports(
							node.importClause.namedBindings,
							updatedElements,
						);
						const newImportClause = factory.updateImportClause(
							node.importClause,
							node.importClause.phaseModifier,
							node.importClause.name,
							newNamedImports,
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
				/* ----------------------Returns for visitor function------------------------------- */
				return ts6.visitEachChild(node, visitor, context);
			}; // visitor;
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		}; // transformer;
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformBundledSource(
			sourceFile,
			compilerOptions,
			transformer,
		);
		return { file, content: _content, ...rest };
	}; // returns
};
//--
const collectDuplicateDeclarations = (deps: DepsFile[]) => {
	const collectFile = (file: string, node: ts6.Node, isGlobalScope = true) => {
		if (isGlobalScope) {
			if (ts6.isVariableStatement(node)) {
				node.declarationList.declarations.forEach((decl) => {
					if (ts6.isIdentifier(decl.name)) {
						const name = decl.name.text;
						if (!duplicateNameMap.has(name)) {
							duplicateNameMap.set(name, new Set([{ file }]));
						} else {
							duplicateNameMap.get(name)?.add({ file });
						}
					}
				});
			} else if (
				ts6.isFunctionDeclaration(node) ||
				ts6.isClassDeclaration(node) ||
				ts6.isEnumDeclaration(node) ||
				ts6.isInterfaceDeclaration(node) ||
				ts6.isTypeAliasDeclaration(node)
			) {
				const name = node.name?.text;
				if (name) {
					if (!duplicateNameMap.has(name)) {
						duplicateNameMap.set(name, new Set([{ file }]));
					} else {
						duplicateNameMap.get(name)?.add({ file });
					}
				}
			}
		}

		if (
			ts6.isBlock(node) ||
			ts6.isFunctionDeclaration(node) ||
			ts6.isFunctionExpression(node) ||
			ts6.isArrowFunction(node) ||
			ts6.isMethodDeclaration(node) ||
			ts6.isClassDeclaration(node)
		) {
			if (ts6.isBlock(node)) {
				node.statements.forEach((child) => collectFile(file, child, false));
			} else {
				ts6.forEachChild(node, (child) => {
					collectFile(file, child, false);
				});
			}
			return;
		}

		ts6.forEachChild(node, (child) => {
			collectFile(file, child, isGlobalScope);
		});
	};

	for (const dep of deps) {
		const sourceFile = createBundledSourceFile(dep.file, dep.content);
		collectFile(dep.file, sourceFile, true);
	}
};

const duplicateUpdater = (
	compilerOptions: ts6.CompilerOptions,
): BundledHandler => {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
		const sourceFile = createBundledSourceFile(file, content);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;
			const visitor = (node: ts6.Node): ts6.Node => {
				if (ts6.isVariableStatement(node)) {
					if (!isTopLevelNode(node)) {
						return ts6.visitEachChild(node, visitor, context);
					}

					const newDeclarations = node.declarationList.declarations.map(
						(decl) => {
							if (ts6.isIdentifier(decl.name)) {
								const base = decl.name.text;

								if (
									duplicateNameMap.has(base) &&
									// biome-ignore  lint/style/noNonNullAssertion : duplicateNameMap.has(base) before that get just only size
									duplicateNameMap.get(base)!.size > 1
								) {
									const newName = duplicateName.getName(
										duplicatePrefixKey,
										base,
									);
									callNameMap.push({ base, file, newName });
									return factory.updateVariableDeclaration(
										decl,
										factory.createIdentifier(newName),
										decl.exclamationToken,
										decl.type,
										decl.initializer,
									);
								}
							}
							return decl;
						},
					);
					const newDeclList = factory.updateVariableDeclarationList(
						node.declarationList,
						newDeclarations,
					);
					return factory.updateVariableStatement(
						node,
						node.modifiers,
						newDeclList,
					);
				} else if (ts6.isFunctionDeclaration(node)) {
					if (!isTopLevelNode(node)) {
						return ts6.visitEachChild(node, visitor, context);
					}

					if (node.name && ts6.isIdentifier(node.name)) {
						const base = node.name.text;

						if (
							duplicateNameMap.has(base) &&
							// biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
							duplicateNameMap.get(base)!.size > 1
						) {
							const newName = duplicateName.getName(duplicatePrefixKey, base);
							callNameMap.push({ base, file, newName });
							return factory.updateFunctionDeclaration(
								node,
								node.modifiers,
								node.asteriskToken,
								factory.createIdentifier(newName),
								node.typeParameters,
								node.parameters,
								node.type,
								node.body,
							);
						}
					}
				} else if (ts6.isClassDeclaration(node)) {
					if (!isTopLevelNode(node)) {
						return ts6.visitEachChild(node, visitor, context);
					}

					if (node.name && ts6.isIdentifier(node.name)) {
						const base = node.name.text;

						if (
							duplicateNameMap.has(base) &&
							// biome-ignore  lint/style/noNonNullAssertion : duplicateNameMap.has(base) before that get just only size
							duplicateNameMap.get(base)!.size > 1
						) {
							const newName = duplicateName.getName(duplicatePrefixKey, base);
							callNameMap.push({ base, file, newName });
							return factory.updateClassDeclaration(
								node,
								node.modifiers,
								factory.createIdentifier(newName),
								node.typeParameters,
								node.heritageClauses,
								node.members,
							);
						}
					}
				}
				/* ----------------------Returns for visitor function------------------------------- */
				return ts6.visitEachChild(node, visitor, context);
			}; // visitor;
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		}; // transformer;
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformBundledSource(
			sourceFile,
			compilerOptions,
			transformer,
		);
		return { file, content: _content, ...rest };
	}; // returns
};

function resetDuplicateState() {
	duplicateNameMap.clear();
	callNameMap.length = 0;
	importNameMap.length = 0;
	exportNameMap.length = 0;
	duplicateName = createDuplicateNameGenerator();
}

const duplicateHandlers = {
	/**
	 * A bundle handler that takes a list of source files and transforms them into renamed source files.
	 * The transformation is done in a series of steps, each step transforms the source files based on the given maps.
	 * The order of the steps is important, as it will determine the final output.
	 * @param deps - A list of source files to be transformed.
	 * @param duplicateNameMap - A map of base names to new names for function calls, import expressions, and export expressions.
	 * @param callNameMap - A map of base names to new names for call expressions.
	 * @param importNameMap - A map of base names to new names for import expressions.
	 * @param exportNameMap - A map of base names to new names for export expressions.
	 * @param compilerOptions - The options for the TypeScript compiler.
	 * @returns A list of transformed source files.
	 */
	renamed: async (
		deps: DepsFile[],
		compilerOptions: ts6.CompilerOptions,
	): Promise<DepsFile[]> => {
		resetDuplicateState();
		collectDuplicateDeclarations(deps);
		deps = deps.map(duplicateUpdater(compilerOptions));
		deps = deps.map(duplicateUsageAndExportHandler(compilerOptions));
		deps = deps.map(duplicateImportExpression(compilerOptions));
		deps = deps.map(duplicateUsageAndExportHandler(compilerOptions));
		return deps;
	},
	/**
	 * A bundle handler that takes a list of source files and checks if they have been renamed correctly.
	 * If a source file has not been renamed, an error will be thrown.
	 * @param deps - A list of source files to be checked.
	 * @param duplicateNameMap - A map of base names to new names for function calls, import expressions, and export expressions.
	 * @param compilerOptions - The options for the TypeScript compiler.
	 * @returns A list of source files that have been renamed correctly.
	 */
	notRenamed: async (
		deps: DepsFile[],
		_compilerOptions: ts6.CompilerOptions,
	): Promise<DepsFile[]> => {
		resetDuplicateState();
		let _err = false;
		collectDuplicateDeclarations(deps);
		duplicateNameMap.forEach((files, name) => {
			if (files.size > 1) {
				_err = true;
				console.warn(`Name -> ${name} declared in multiple files : `);
				files.forEach((f) => console.warn(`  - ${f.file}`));
			}
		});
		if (_err) {
			process.exit(1);
		}
		return deps;
	},
};

export { duplicateHandlers };
