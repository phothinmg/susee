import ts from "typescript";
import transformFunction from "@suseejs/transformer";
import type {
  DependenciesFile,
  RequireImportObject,
  BundleHandler,
} from "@suseejs/types";

/**
 * Finds all the properties accessed in the given node.
 * @param {ts.Node} node - The node to search through.
 * @returns {string[]} - An array of all the properties accessed.
 */
function findProperty(node: ts.Node): string[] {
  const properties: string[] = [];
  function walk(n: ts.Node) {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
      properties.push(n.expression.text);
    }
    n.forEachChild(walk);
  }
  walk(node);
  return properties;
}

/**
 * Transforms a commonjs file into an ES module.
 * It detects all the requires and then generates import statements based on the requires.
 * @param {ts.CompilerOptions} compilerOptions - The compiler options.
 * @returns {BundleHandler} - A bundle handler that transforms a commonjs file into an ES module.
 */
function commonjsImportsHandler(
  compilerOptions: ts.CompilerOptions,
): BundleHandler {
  let properties: string[] = [];
  let removedStatements: string[] = [];
  return (deps: DependenciesFile) => {
    if (
      deps.moduleType === "cjs" &&
      (deps.fileExt === ".js" || deps.fileExt === ".cjs")
    ) {
      const sourceFile = ts.createSourceFile(
        deps.file,
        deps.content,
        ts.ScriptTarget.Latest,
        true,
      );
      // collect all property-access roots first so we can detect namespace usage
      properties = [];
      for (const stmt of sourceFile.statements) {
        properties = [...properties, ...findProperty(stmt)];
      }

      const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
        const { factory } = context;
        const visitor = (node: ts.Node): ts.Node => {
          const obj: RequireImportObject = {
            isNamespace: false,
            isTypeOnly: false,
            isTypeNamespace: false,
            source: "",
            importedString: undefined,
            importedObject: undefined,
          };

          if (ts.isVariableStatement(node)) {
            const decls = node.declarationList.declarations;
            if (decls.length === 1) {
              const decl = decls[0] as ts.VariableDeclaration;
              //
              if (decl.initializer) {
                // const foo = require "foo"
                if (
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
                  // const foo = require "foo"
                }
              }
            }
          } // VariableStatement
          /* ----------------------Returns for visitor function------------------------------- */
          return ts.visitEachChild(node, visitor, context);
        };
        /* --------------------Returns for transformer function--------------------------------- */
        return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
      };
      /* --------------------Returns for main handler function--------------------------------- */
      let _content = transformFunction(
        transformer,
        sourceFile,
        compilerOptions,
      );
      _content = `${removedStatements.join("\n")}\n${_content}`;
      _content = _content.replace(/^s*;\s*$/gm, "").trim();
      const { file, content, ...rest } = deps;
      return { file, content: _content, ...rest } as DependenciesFile;
    } else {
      return deps;
    }
  };
}

export default commonjsImportsHandler;
