import transformFunction from "@suseejs/transformer";
import type {
  BundleHandler,
  DepsFile,
  TypeObj,
  RequireImportObject,
} from "@suseejs/types";
import ts from "typescript";
import utilities from "@suseejs/utils";
import resolves from "@phothinmaung/resolves";

function esmExportRemoveHandler(
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
        // --- Case 1: Strip "export" modifiers ---
        const inside_nameSpace = utilities.isInsideNamespace(node);
        if (!inside_nameSpace) {
          if (
            ts.isFunctionDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isVariableStatement(node)
          ) {
            const modifiers = node.modifiers?.filter(
              (m) =>
                m.kind !== ts.SyntaxKind.ExportKeyword &&
                m.kind !== ts.SyntaxKind.DefaultKeyword,
            );
            if (modifiers?.length !== node.modifiers?.length) {
              // If the node has an export modifier, remove it.
              // If the node is a function, class, interface, type alias, enum or variable declaration,
              // update the declaration by removing the export modifier.
              if (ts.isFunctionDeclaration(node)) {
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
              if (ts.isClassDeclaration(node)) {
                return factory.updateClassDeclaration(
                  node,
                  modifiers,
                  node.name,
                  node.typeParameters,
                  node.heritageClauses,
                  node.members,
                );
              } // class
              if (ts.isInterfaceDeclaration(node)) {
                return factory.updateInterfaceDeclaration(
                  node,
                  modifiers,
                  node.name,
                  node.typeParameters,
                  node.heritageClauses,
                  node.members,
                );
              } // interface
              if (ts.isTypeAliasDeclaration(node)) {
                return factory.updateTypeAliasDeclaration(
                  node,
                  modifiers,
                  node.name,
                  node.typeParameters,
                  node.type,
                );
              } // types
              if (ts.isEnumDeclaration(node)) {
                return factory.updateEnumDeclaration(
                  node,
                  modifiers,
                  node.name,
                  node.members,
                );
              } //enum
              if (ts.isVariableStatement(node)) {
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
        if (ts.isExportDeclaration(node)) {
          // If the node is an export declaration, remove it.
          return factory.createEmptyStatement();
        }
        // --- Case 3: Handle "export default ..." ---
        if (ts.isExportAssignment(node)) {
          const expr = node.expression;
          // export default Foo;   -> remove line
          if (ts.isIdentifier(expr)) {
            return factory.createEmptyStatement();
          }
        }
        /* ----------------------Returns for visitor function------------------------------- */
        return ts.visitEachChild(node, visitor, context);
      };
      /* --------------------Returns for transformer function--------------------------------- */
      return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
    };
    /* --------------------Returns for main handler function--------------------------------- */
    const _content = transformFunction(
      transformer,
      sourceFile,
      compilerOptions,
    );
    return { file, content: _content, ...rest };
  };
}

let properties: string[] = [];
const typeObj: TypeObj = {};
const typesNames: string[] = [];

function findProperty(node: ts.Node) {
  const properties: string[] = [];
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    properties.push(node.expression.text);
  }

  node.forEachChild((n) => findProperty(n));
  return properties;
}

function importAllRemoveHandler(
  removedStatements: string[],
  compilerOptions: ts.CompilerOptions,
): BundleHandler {
  return ({ file, content, ...rest }: DepsFile): DepsFile => {
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

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
    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      const { factory } = context;
      const visitor = (node: ts.Node): ts.Node => {
        properties = [...properties, ...findProperty(node)];
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
        /* ----------------------Returns for visitor function------------------------------- */
        return ts.visitEachChild(node, visitor, context);
      };
      /* --------------------Returns for transformer function--------------------------------- */
      return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
    };
    /* --------------------Returns for main handler function--------------------------------- */
    const _content = transformFunction(
      transformer,
      sourceFile,
      compilerOptions,
    );
    return { file, content: _content, ...rest };
  };
}

const removeHandlers = async (
  removedStatements: string[],
  compilerOptions: ts.CompilerOptions,
): Promise<[BundleHandler, BundleHandler]> => {
  const resolved = resolves([
    [importAllRemoveHandler, removedStatements, compilerOptions],
    [esmExportRemoveHandler, compilerOptions],
  ]);

  return await resolved.series();
};

export default removeHandlers;
