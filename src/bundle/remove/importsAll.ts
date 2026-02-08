import ts from "typescript";
import type {
	BundleVisitorFunc,
	NodeVisit,
	RequireImportObject,
	TypeObj,
} from "../../types_def.js";
import utilities from "../../utils.js";

let properties: string[] = [];
const typeObj: TypeObj = {};
const typesNames: string[] = [];

const importsAllVisitor: BundleVisitorFunc = (
	context,
	{ file, content },
	sourceFile,
	removedStatements: string[],
) => {
	// Pre-scan: collect names of type-only import-equals (these are namespace-type aliases)
	// import type NameSpace = require("foo")
	const typeOnlyImportEquals = new Set<string>();
	for (const stmt of sourceFile.statements) {
		if (ts.isImportEqualsDeclaration(stmt) && stmt.isTypeOnly) {
			const moduleReference = stmt.moduleReference;
			if (
				ts.isExternalModuleReference(moduleReference) &&
				ts.isStringLiteral(moduleReference.expression)
			) {
				typeOnlyImportEquals.add(stmt.name.text);
			}
		}
	}

	const { factory } = context;

	const visit: NodeVisit = (node) => {
		properties = [...properties, ...utilities.findProperty(node)];
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
			ts.isTypeReferenceNode(node) &&
			ts.isQualifiedName(node.typeName) &&
			ts.isIdentifier(node.typeName.left) &&
			ts.isIdentifier(node.typeName.right)
		) {
			const left = node.typeName.left.text;
			const right = node.typeName.right.text;
			typesNames.push(left);
			if (left in typeObj) {
				typeObj[left]?.push(right);
			} else {
				typeObj[left] = [right];
			}

			// If this qualified name refers to a type-only import-equals alias, DO NOT rewrite.
			// Rewriting (Foo.Bar -> Bar) was intended to support converting to named imports,
			// but for type-only namespace imports we will emit `import type * as Foo from "..."`.
			if (utilities.checkModuleType(sourceFile, file).isCommonJs) {
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
		if (ts.isImportDeclaration(node)) {
			// --- Case 1: Import declarations
			const text = node.getText(sourceFile);
			removedStatements.push(text);
			return factory.createEmptyStatement();
		}

		//--- Case 2: Import equals declarations
		if (ts.isImportEqualsDeclaration(node)) {
			const name = node.name.text;
			const moduleReference = node.moduleReference;

			if (node.isTypeOnly) {
				obj.isTypeOnly = true;
			}
			obj.importedString = name;
			if (!obj.isTypeOnly) {
				if (properties.includes(name)) {
					obj.isNamespace = true;
				}
			}
			if (
				ts.isExternalModuleReference(moduleReference) &&
				ts.isStringLiteral(moduleReference.expression)
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
						if (typesNames.includes(obj.importedString)) {
							t = `import type { ${typeObj[obj.importedString]?.join(",")} } from "${obj.source}";`;
						} else {
							t = `import type ${obj.importedString} from "${obj.source}";`;
						}
					}
				} else {
					if (obj.isNamespace && obj.source && obj.source !== "typescript") {
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
		if (ts.isVariableStatement(node)) {
			const decls = node.declarationList.declarations;
			if (decls.length === 1) {
				const decl = decls[0] as ts.VariableDeclaration;
				if (
					decl.initializer &&
					ts.isCallExpression(decl.initializer) &&
					ts.isIdentifier(decl.initializer.expression) &&
					decl.initializer.expression.escapedText === "require"
				) {
					// imported from
					const arg = decl.initializer.arguments[0] as ts.Expression;
					if (ts.isStringLiteral(arg)) {
						obj.source = arg.text;
					}
					if (ts.isIdentifier(decl.name)) {
						const _n = decl.name.text;
						obj.importedString = _n;
						if (properties.includes(_n)) {
							obj.isNamespace = true;
						}
					} else if (ts.isObjectBindingPattern(decl.name)) {
						const _names: string[] = [];
						for (const ele of decl.name.elements) {
							if (ts.isIdentifier(ele.name)) {
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
		// --------- Visitor Return ------------------//
		return ts.visitEachChild(node, visit, context);
	};
	return visit;
};

export default importsAllVisitor;
