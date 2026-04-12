import path from "node:path";
import type { NamesSets } from "susee-types";
import ts from "typescript";
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

export const exportDefaultVisitors = {
	resetState() {
		exportDefaultExportNameMap.length = 0;
		exportDefaultImportNameMap.length = 0;
		exportDefaultName = createExportDefaultNameGenerator();
	},
	export(context: ts.TransformationContext, file: string) {
		const { factory } = context;
		function visitor(node: ts.Node): ts.Node {
			const fileName = path.basename(file).split(".")[0] as string;
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
		return visitor;
	},
	import(
		context: ts.TransformationContext,
		file: string,
		sourceFile: ts.SourceFile,
	) {
		const { factory } = context;
		function visitor(node: ts.Node): ts.Node {
			if (ts.isImportDeclaration(node)) {
				const fileName = node.moduleSpecifier.getText(sourceFile);
				const _name = (path.basename(fileName).split(".")[0] as string).trim();
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
		}
		return visitor;
	},
	called(context: ts.TransformationContext, file: string) {
		const { factory } = context;
		function visitor(node: ts.Node): ts.Node {
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
		}
		return visitor;
	}, //
	update(context: ts.TransformationContext, file: string) {
		const { factory } = context;
		function visitor(node: ts.Node): ts.Node {
			const _name = path.basename(file).split(".")[0] as string;
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
		return visitor;
	}, //
};
