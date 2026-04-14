import tcolor from "./tcolor.js";
import ts from "typescript";
import module from "node:module";

namespace checks {
  /**
   * Checks the given source file for module type (CommonJS or ESM).
   * @param sourceFile - The source file to check.
   * @param file - The file path of the source file.
   * @returns An object containing the results of the check.
   * @returns {isCommonJs: boolean, isEsm: boolean}
   */
  export const moduleType = (sourceFile: ts.SourceFile, file: string) => {
    let _esmCount = 0;
    let cjsCount = 0;
    let unknownCount = 0;

    try {
      let hasESMImports = false;
      let hasCommonJS = false;

      // Walk through the AST to detect module syntax
      function walk(node: ts.Node) {
        // Check for ESM import/export syntax
        if (
          ts.isImportDeclaration(node) ||
          ts.isImportEqualsDeclaration(node) ||
          ts.isExportDeclaration(node) ||
          ts.isExportSpecifier(node) ||
          ts.isExportAssignment(node)
        ) {
          hasESMImports = true;
        }

        // Check for export modifier on declarations
        if (
          (ts.isVariableStatement(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isClassDeclaration(node)) &&
          node.modifiers?.some(
            (mod) => mod.kind === ts.SyntaxKind.ExportKeyword,
          )
        ) {
          hasESMImports = true;
        }

        // Check for CommonJS require/exports
        if (ts.isCallExpression(node)) {
          if (
            ts.isIdentifier(node.expression) &&
            node.expression.text === "require" &&
            node.arguments.length > 0
          ) {
            hasCommonJS = true;
          }
        }

        // Check for module.exports or exports.xxx
        if (ts.isPropertyAccessExpression(node)) {
          const text = node.getText(sourceFile);
          if (
            text.startsWith("module.exports") ||
            text.startsWith("exports.")
          ) {
            hasCommonJS = true;
          }
        }

        // Continue walking the AST
        ts.forEachChild(node, walk);
      } //---
      walk(sourceFile);

      // Determine the module format based on what we found
      if (hasESMImports && !hasCommonJS) {
        _esmCount++;
      } else if (hasCommonJS && !hasESMImports) {
        cjsCount++;
      } else if (hasESMImports && hasCommonJS) {
        // Mixed - probably ESM with dynamic imports or similar
        _esmCount++;
      }
    } catch (error) {
      console.error(
        tcolor.magenta(
          `Error checking module format for ${file} : \n ${error}`,
        ),
      );
      unknownCount++;
    }
    if (unknownCount > 0) {
      console.error(tcolor.magenta(`Error checking module format.`));
      ts.sys.exit(1);
    }

    return {
      isCommonJs: cjsCount > 0,
      isEsm: _esmCount > 0,
    };
  };
  /**
   * Checks if the given code string contains JSX syntax.
   * @param code The content of the file as a string.
   * @returns true if the file contains JSX, false otherwise.
   */
  export function isJsxContent(code: string): boolean {
    const sourceFile = ts.createSourceFile(
      "file.tsx",
      code,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ true,
      ts.ScriptKind.TSX,
    );

    let containsJsx = false;

    function visitor(node: ts.Node) {
      // Check for JSX Elements, Self Closing Elements, or JSX Fragments
      if (
        ts.isJsxElement(node) ||
        ts.isJsxSelfClosingElement(node) ||
        ts.isJsxFragment(node)
      ) {
        containsJsx = true;
        return;
      }
      ts.forEachChild(node, visitor);
    }

    visitor(sourceFile);

    return containsJsx;
  }
  /**
   * Checks if a given node is inside a namespace declaration.
   * It does this by traversing up the parent nodes until it finds a module declaration with the namespace flag set.
   * @param n The node to check.
   * @returns true if the node is inside a namespace declaration, false otherwise.
   */
  export const isInsideNamespace = (n: ts.Node): boolean => {
    let current: ts.Node | undefined = n.parent;
    while (current) {
      if (
        ts.isModuleDeclaration(current) &&
        current.flags === ts.NodeFlags.Namespace
      ) {
        return true;
      }
      current = current.parent;
    }
    return false;
  };
  /**
   * Check if a given module is a Node.js built-in module.
   * @param {string} input - The module to check.
   * @returns {boolean} True if the module is a Node.js built-in module, false otherwise.
   */
  export const isNodeBuiltinModule = (input: string): boolean => {
    const nodeModuleSpecifier: string = "node:";
    const nodeBuiltinModules = new Set<string>(module.builtinModules);
    return (
      input.startsWith(nodeModuleSpecifier) || nodeBuiltinModules.has(input)
    );
  };
}

export { checks };
