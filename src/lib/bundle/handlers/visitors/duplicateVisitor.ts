// cSpell:disable

import path from "node:path";
import type { DuplicatesNameMap, NamesSets } from "susee-types";
import ts from "typescript";

// construct maps
const callNameMap: NamesSets = [];
const importNameMap: NamesSets = [];
const exportNameMap: NamesSets = [];

function __uniqueName() {
	const storedPrefix: Map<string, string> = new Map();

	const obj = {
		setPrefix({ key, value }: { key: string; value: string }) {
			const names: string[] = [];
			let _fix: string | undefined;

			if (storedPrefix.has(key)) {
				console.warn(`${key} already exist`);
				throw new Error();
			} else {
				_fix = value;
				storedPrefix.set(key, value);
			}
			function getName(input: string) {
				const length = names.length;
				const _name = _fix
					? `${_fix}${input}_${length + 1}`
					: `$nyein${input}_${length + 1}`;
				names.push(_name);
				return _name;
			}
			return { getName };
		},
		getPrefix(key: string) {
			if (storedPrefix.has(key)) {
				return storedPrefix.get(key);
			}
		},
	};
	return obj;
}

let dupName = __uniqueName().setPrefix({
	key: "DuplicatesNames",
	value: "__duplicatesNames__",
});

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

export const duplicateVisitors = {
	resetDuplicateState(namesMap: DuplicatesNameMap) {
		namesMap.clear();
		callNameMap.length = 0;
		importNameMap.length = 0;
		exportNameMap.length = 0;
		dupName = __uniqueName().setPrefix({
			key: "DuplicatesNames",
			value: "__duplicatesNames__",
		});
	},

	calledExpressions(context: ts.TransformationContext, file: string) {
		const { factory } = context;
		const getMappedName = (base: string) => {
			const mapping = callNameMap.find(
				(m) => m.base === base && m.file === file,
			);
			const importMapping = importNameMap.find(
				(m) => m.base === base && m.file === file,
			);

			if (mapping) {
				return mapping.newName;
			}

			if (importMapping) {
				return importMapping.newName;
			}

			return null;
		};

		const isDeclarationName = (node: ts.Identifier) => {
			const parent = node.parent;

			if (!parent) {
				return false;
			}

			if (
				(ts.isVariableDeclaration(parent) && parent.name === node) ||
				((ts.isFunctionDeclaration(parent) ||
					ts.isClassDeclaration(parent) ||
					ts.isInterfaceDeclaration(parent) ||
					ts.isTypeAliasDeclaration(parent) ||
					ts.isEnumDeclaration(parent) ||
					ts.isParameter(parent) ||
					ts.isBindingElement(parent) ||
					ts.isImportClause(parent) ||
					ts.isNamespaceImport(parent) ||
					ts.isImportSpecifier(parent) ||
					ts.isExportSpecifier(parent) ||
					ts.isTypeParameterDeclaration(parent)) &&
					parent.name === node)
			) {
				return true;
			}

			if (
				(ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent)) &&
				parent.name === node
			) {
				return true;
			}

			return false;
		};

		const visitor = (node: ts.Node): ts.Node => {
			if (ts.isCallExpression(node)) {
				if (ts.isIdentifier(node.expression)) {
					const new_name = getMappedName(node.expression.text);
					if (new_name) {
						return factory.updateCallExpression(
							node,
							factory.createIdentifier(new_name),
							node.typeArguments,
							node.arguments,
						);
					}
				}
			} else if (ts.isPropertyAccessExpression(node)) {
				if (ts.isIdentifier(node.expression)) {
					const new_name = getMappedName(node.expression.text);
					if (new_name) {
						return factory.updatePropertyAccessExpression(
							node,
							factory.createIdentifier(new_name),
							node.name,
						);
					}
				}
			} else if (ts.isNewExpression(node)) {
				if (ts.isIdentifier(node.expression)) {
					const new_name = getMappedName(node.expression.text);
					if (new_name) {
						return factory.updateNewExpression(
							node,
							factory.createIdentifier(new_name),
							node.typeArguments,
							node.arguments,
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

				if (ts.isPropertyAssignment(node.parent) && node.parent.name === node) {
					return node;
				}

				const new_name = getMappedName(node.text);
				if (new_name) {
					if (
						ts.isShorthandPropertyAssignment(node.parent) &&
						node.parent.name === node
					) {
						return factory.createPropertyAssignment(
							factory.createIdentifier(node.text),
							factory.createIdentifier(new_name),
						);
					}

					return factory.createIdentifier(new_name);
				}
			}
			/* ----------------------Returns for visitor function------------------------------- */
			return ts.visitEachChild(node, visitor, context);
		}; // visitor;
		return visitor;
	}, //
	exportExpressions(context: ts.TransformationContext, file: string) {
		const { factory } = context;
		const visitor = (node: ts.Node): ts.Node => {
			if (ts.isExportSpecifier(node)) {
				if (ts.isIdentifier(node.name)) {
					const base = node.name.text;
					let new_name: string | null = null;
					const mapping = callNameMap.find(
						(m) => m.base === base && m.file === file,
					);
					const importMapping = importNameMap.find(
						(m) => m.base === base && m.file === file,
					);
					if (mapping) {
						exportNameMap.push({
							base,
							file: getFileKey(file),
							newName: mapping.newName,
						});
						new_name = mapping.newName;
					} else if (importMapping) {
						new_name = importMapping.newName;
					}
					if (new_name) {
						return factory.updateExportSpecifier(
							node,
							node.isTypeOnly,
							node.propertyName,
							factory.createIdentifier(new_name),
						);
					}
				}
			} else if (ts.isExportAssignment(node)) {
				const expr = node.expression;
				if (ts.isIdentifier(expr)) {
					const base = expr.text;
					let new_name: string | null = null;
					const mapping = callNameMap.find(
						(m) => m.base === base && m.file === file,
					);
					const importMapping = importNameMap.find(
						(m) => m.base === base && m.file === file,
					);
					if (mapping) {
						exportNameMap.push({
							base,
							file: getFileKey(file),
							newName: mapping.newName,
						});
						new_name = mapping.newName;
					} else if (importMapping) {
						new_name = importMapping.newName;
					}
					if (new_name) {
						return factory.updateExportAssignment(
							node,
							node.modifiers,
							factory.createIdentifier(new_name),
						);
					}
				}
			}
			/* ----------------------Returns for visitor function------------------------------- */
			return ts.visitEachChild(node, visitor, context);
		}; // visitor;
		return visitor;
	}, //
	importExpressions(
		context: ts.TransformationContext,
		file: string,
		sourceFile: ts.SourceFile,
	) {
		const { factory } = context;
		const visitor = (node: ts.Node): ts.Node => {
			if (ts.isImportDeclaration(node)) {
				const moduleKey = getModuleKeyFromSpecifier(
					node.moduleSpecifier,
					sourceFile,
					file,
				);
				let baseNames: string[] = [];
				if (
					node.importClause?.namedBindings &&
					ts.isNamedImports(node.importClause.namedBindings)
				) {
					baseNames = node.importClause.namedBindings.elements.map((el) =>
						el.name.text.trim(),
					);
				}
				// import default expression
				if (
					node.importClause?.name &&
					ts.isIdentifier(node.importClause.name)
				) {
					const base = node.importClause.name.text.trim();
					const mapping = exportNameMap.find(
						(m) => m.base === base && m.file === moduleKey,
					);
					if (mapping) {
						importNameMap.push({
							base: mapping.base,
							file,
							newName: mapping.newName,
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
				// import name , `import{ ... }`
				if (
					baseNames.length > 0 &&
					node.importClause &&
					node.importClause.namedBindings &&
					ts.isNamedImports(node.importClause.namedBindings)
				) {
					const updatedElements = node.importClause.namedBindings.elements.map(
						(el) => {
							const mapping = exportNameMap.find(
								(m) => m.base === el.name.text.trim() && m.file === moduleKey,
							);

							if (mapping) {
								importNameMap.push({
									base: mapping.base,
									file,
									newName: mapping.newName,
								});
								return factory.updateImportSpecifier(
									el,
									el.isTypeOnly,
									el.propertyName,
									factory.createIdentifier(mapping.newName),
								);
							}
							return el;
						},
					);
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
			} //&&
			/* ----------------------Returns for visitor function------------------------------- */
			return ts.visitEachChild(node, visitor, context);
		}; // visitor;
		return visitor;
	}, //
	collector(
		context: ts.TransformationContext,
		file: string,
		namesMap: DuplicatesNameMap,
	) {
		function visitNode(node: ts.Node, isGlobalScope: boolean = true): ts.Node {
			// Global declarations များကိုသာ collect လုပ်မယ်
			if (isGlobalScope) {
				// Variable statements (const, let, var)
				if (ts.isVariableStatement(node)) {
					node.declarationList.declarations.forEach((decl) => {
						if (ts.isIdentifier(decl.name)) {
							const $name = decl.name.text;
							if (!namesMap.has($name)) {
								namesMap.set($name, new Set([{ file }]));
							} else {
								// biome-ignore  lint/style/noNonNullAssertion : !namesMap.has($name) before
								namesMap.get($name)!.add({ file });
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
							namesMap.set($name, new Set([{ file }]));
						} else {
							// biome-ignore  lint/style/noNonNullAssertion : !namesMap.has($name) before
							namesMap.get($name)!.add({ file });
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
					ts.visitNodes(node.statements, (child) => visitNode(child, false));
				} else {
					ts.forEachChild(node, (child) => {
						visitNode(child, false);
					});
				}
			} else {
				// Global scope ထဲဆက်ရှိနေတဲ့ node တွေအတွက်
				return ts.visitEachChild(
					node,
					(child) => visitNode(child, isGlobalScope),
					context,
				);
			}
			/* ----------------------Returns for visitNode function------------------------------- */
			return node;
		} // visitNode
		return visitNode;
	},
	updater(
		context: ts.TransformationContext,
		file: string,
		namesMap: DuplicatesNameMap,
	) {
		const { factory } = context;
		const visitor = (node: ts.Node): ts.Node => {
			if (ts.isVariableStatement(node)) {
				const newDeclarations = node.declarationList.declarations.map(
					(decl) => {
						if (ts.isIdentifier(decl.name)) {
							const base = decl.name.text;
							// biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
							if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
								const newName = dupName.getName(base);
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
			} else if (ts.isFunctionDeclaration(node)) {
				if (node.name && ts.isIdentifier(node.name)) {
					const base = node.name.text;
					// biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
					if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
						const newName = dupName.getName(base);
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
			} else if (ts.isClassDeclaration(node)) {
				if (node.name && ts.isIdentifier(node.name)) {
					const base = node.name.text;
					// biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
					if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
						const newName = dupName.getName(base);
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
			return ts.visitEachChild(node, visitor, context);
		}; // visitor;
		return visitor;
	},
};
