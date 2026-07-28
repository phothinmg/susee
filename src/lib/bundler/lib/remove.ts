import ts6 from "@typescript/typescript6";
import type {
	BundledHandler,
	DepsFile,
	RequireImportObject,
	TypeObj,
} from "../../../types.js";
import { utils } from "../../utilities.js";
import { createBundledSourceFile, transformBundledSource } from "./helpers.js";

const properties: string[] = [];
const propertiesSet = new Set<string>();
const typeObj: TypeObj = {};
const typesNames = new Set<string>();

function esmExportRemoveHandler(
	compilerOptions: ts6.CompilerOptions,
): BundledHandler {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
		const sourceFile = createBundledSourceFile(file, content);
		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			const { factory } = context;
			const visitor = (node: ts6.Node): ts6.Node => {
				// --- Case 1: Strip "export" modifiers ---
				const inside_nameSpace = utils.checks.isInsideNamespace(node);
				if (!inside_nameSpace) {
					if (
						ts6.isFunctionDeclaration(node) ||
						ts6.isClassDeclaration(node) ||
						ts6.isInterfaceDeclaration(node) ||
						ts6.isTypeAliasDeclaration(node) ||
						ts6.isEnumDeclaration(node) ||
						ts6.isVariableStatement(node)
					) {
						const modifiers = node.modifiers?.filter(
							(m) =>
								m.kind !== ts6.SyntaxKind.ExportKeyword &&
								m.kind !== ts6.SyntaxKind.DefaultKeyword,
						);
						if (modifiers?.length !== node.modifiers?.length) {
							// If the node has an export modifier, remove it.
							// If the node is a function, class, interface, type alias, enum or variable declaration,
							// update the declaration by removing the export modifier.
							if (ts6.isFunctionDeclaration(node)) {
								return factory.updateFunctionDeclaration(
									node,
									modifiers,
									node.asteriskToken,
									node.name,
									node.typeParameters,
									node.parameters,
									node.type,
									node.body,
								);
							} // function
							if (ts6.isClassDeclaration(node)) {
								return factory.updateClassDeclaration(
									node,
									modifiers,
									node.name,
									node.typeParameters,
									node.heritageClauses,
									node.members,
								);
							} // class
							if (ts6.isInterfaceDeclaration(node)) {
								return factory.updateInterfaceDeclaration(
									node,
									modifiers,
									node.name,
									node.typeParameters,
									node.heritageClauses,
									node.members,
								);
							} // interface
							if (ts6.isTypeAliasDeclaration(node)) {
								return factory.updateTypeAliasDeclaration(
									node,
									modifiers,
									node.name,
									node.typeParameters,
									node.type,
								);
							} // types
							if (ts6.isEnumDeclaration(node)) {
								return factory.updateEnumDeclaration(
									node,
									modifiers,
									node.name,
									node.members,
								);
							} //enum
							if (ts6.isVariableStatement(node)) {
								return factory.updateVariableStatement(
									node,
									modifiers,
									node.declarationList,
								);
							} // vars
						} //--
					} // --- Case 1
				}
				// --- Case 2: Remove "export { foo }" entirely ---
				if (ts6.isExportDeclaration(node)) {
					// If the node is an export declaration, remove it.
					return factory.createEmptyStatement();
				}
				// --- Case 3: Handle "export default ..." ---
				if (ts6.isExportAssignment(node)) {
					const expr = node.expression;
					// export default Foo;   -> remove line
					if (ts6.isIdentifier(expr)) {
						return factory.createEmptyStatement();
					}
				}
				/* ----------------------Returns for visitor function------------------------------- */
				return ts6.visitEachChild(node, visitor, context);
			};
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		};
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformBundledSource(
			sourceFile,
			compilerOptions,
			transformer,
		);
		return { file, content: _content, ...rest };
	};
}
function importAllRemoveHandler(
	removedStatements: string[],
	compilerOptions: ts6.CompilerOptions,
): BundledHandler {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
		const sourceFile = createBundledSourceFile(file, content);
		const isCommonJsFile = utils.checks.moduleType(content, file).isCommonJs;

		const transformer: ts6.TransformerFactory<ts6.SourceFile> = (context) => {
			// Pre-scan: collect names of type-only import-equals (these are namespace-type aliases)
			// import type NameSpace = require("foo")
			const typeOnlyImportEquals = new Set<string>();
			for (const stmt of sourceFile.statements) {
				if (ts6.isImportEqualsDeclaration(stmt) && stmt.isTypeOnly) {
					const moduleReference = stmt.moduleReference;
					if (
						ts6.isExternalModuleReference(moduleReference) &&
						ts6.isStringLiteral(moduleReference.expression)
					) {
						typeOnlyImportEquals.add(stmt.name.text);
					}
				}
			}
			const { factory } = context;
			const visitor = (node: ts6.Node): ts6.Node => {
				if (
					ts6.isPropertyAccessExpression(node) &&
					ts6.isIdentifier(node.expression)
				) {
					properties.push(node.expression.text);
					propertiesSet.add(node.expression.text);
				}
				const obj: RequireImportObject = {
					isNamespace: false,
					isTypeOnly: false,
					isTypeNamespace: false,
					source: "",
					importedString: undefined,
					importedObject: undefined,
				};

				// --- Case: TypeReference with QualifiedName (collect type usage)
				if (
					ts6.isTypeReferenceNode(node) &&
					ts6.isQualifiedName(node.typeName) &&
					ts6.isIdentifier(node.typeName.left) &&
					ts6.isIdentifier(node.typeName.right)
				) {
					const left = node.typeName.left.text;
					const right = node.typeName.right.text;
					typesNames.add(left);
					if (left in typeObj) {
						typeObj[left]?.push(right);
					} else {
						typeObj[left] = [right];
					}

					// If this qualified name refers to a type-only import-equals alias, DO NOT rewrite.
					// Rewriting (Foo.Bar -> Bar) was intended to support converting to named imports,
					// but for type-only namespace imports we will emit `import type * as Foo from "..."`.
					if (isCommonJsFile) {
						if (left !== "ts" && !typeOnlyImportEquals.has(left)) {
							return factory.updateTypeReferenceNode(
								node,
								factory.createIdentifier(right),
								undefined,
							);
						}
					}
				}
				// ------------------------
				if (ts6.isImportDeclaration(node)) {
					// --- Case 1: Import declarations
					const text = node.getText(sourceFile);
					removedStatements.push(text);
					return factory.createEmptyStatement();
				}

				//--- Case 2: Import equals declarations
				if (ts6.isImportEqualsDeclaration(node)) {
					const name = node.name.text;
					const moduleReference = node.moduleReference;

					if (node.isTypeOnly) {
						obj.isTypeOnly = true;
					}
					obj.importedString = name;
					if (!obj.isTypeOnly) {
						if (propertiesSet.has(name)) {
							obj.isNamespace = true;
						}
					}
					if (
						ts6.isExternalModuleReference(moduleReference) &&
						ts6.isStringLiteral(moduleReference.expression)
					) {
						obj.source = moduleReference.expression.text;
					}

					let t: string | undefined;
					if (obj.importedString && !obj.importedObject) {
						if (obj.isTypeOnly) {
							// If this import-equals was a type-only namespace alias, emit a namespace type import
							if (typeOnlyImportEquals.has(obj.importedString)) {
								t = `import type * as ${obj.importedString} from "${obj.source}";`;
							} else {
								// otherwise try to emit a named/default type import (existing behavior)
								if (typesNames.has(obj.importedString)) {
									t = `import type { ${typeObj[obj.importedString]?.join(",")} } from "${obj.source}";`;
								} else {
									t = `import type ${obj.importedString} from "${obj.source}";`;
								}
							}
						} else {
							if (
								obj.isNamespace &&
								obj.source &&
								obj.source !== "typescript"
							) {
								t = `import * as ${obj.importedString} from "${obj.source}";`;
							} else {
								t = `import ${obj.importedString} from "${obj.source}";`;
							}
						}
					}
					if (!obj.importedString && obj.importedObject) {
						t = `import { ${obj.importedObject.join(", ")} } from "${obj.source}";`;
					}
					// removed
					if (t) {
						removedStatements.push(t);
						return factory.createEmptyStatement();
					}
				}

				// --- Case 3: Require imports
				if (ts6.isVariableStatement(node)) {
					const decls = node.declarationList.declarations;
					if (decls.length === 1) {
						const decl = decls[0] as ts6.VariableDeclaration;
						if (
							decl.initializer &&
							ts6.isCallExpression(decl.initializer) &&
							ts6.isIdentifier(decl.initializer.expression) &&
							decl.initializer.expression.escapedText === "require"
						) {
							// imported from
							const arg = decl.initializer.arguments[0] as ts6.Expression;
							if (ts6.isStringLiteral(arg)) {
								obj.source = arg.text;
							}
							if (ts6.isIdentifier(decl.name)) {
								const _n = decl.name.text;
								obj.importedString = _n;
								if (propertiesSet.has(_n)) {
									obj.isNamespace = true;
								}
							} else if (ts6.isObjectBindingPattern(decl.name)) {
								const _names: string[] = [];
								for (const ele of decl.name.elements) {
									if (ts6.isIdentifier(ele.name)) {
										_names.push(ele.name.text);
									}
								}
								if (_names.length > 0) {
									obj.importedObject = _names;
								}
							}
							let tt: string | undefined;
							if (obj.importedString && !obj.importedObject) {
								if (obj.isNamespace) {
									tt = `import * as ${obj.importedString} from "${obj.source}";`;
								} else {
									tt = `import ${obj.importedString} from "${obj.source}";`;
								}
							}
							if (!obj.importedString && obj.importedObject) {
								tt = `import { ${obj.importedObject.join(", ")} } from "${obj.source}";`;
							}
							if (tt) {
								removedStatements.push(tt);
								return factory.createEmptyStatement();
							}
						}
					}
				}
				/* ----------------------Returns for visitor function------------------------------- */
				return ts6.visitEachChild(node, visitor, context);
			};
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => ts6.visitNode(rootNode, visitor) as ts6.SourceFile;
		};
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformBundledSource(
			sourceFile,
			compilerOptions,
			transformer,
		);
		return { file, content: _content, ...rest };
	};
}

const removeHandlers = async (
	removedStatements: string[],
	compilerOptions: ts6.CompilerOptions,
): Promise<[BundledHandler, BundledHandler]> => {
	const resolved = utils.promises.resolve([
		[importAllRemoveHandler, removedStatements, compilerOptions],
		[esmExportRemoveHandler, compilerOptions],
	]);

	return await resolved.series();
};

export { removeHandlers };
