import fs from "node:fs";
import path from "node:path";
import tcolor from "@suseejs/tcolor";
import ts from "typescript";

namespace utilities {
  export const wait = (time: number) =>
    new Promise((resolve) => setTimeout(resolve, time));
  export const resolvePath = ts.sys.resolvePath;
  export const fileExists = ts.sys.fileExists;
  export const directoryExists = ts.sys.directoryExists;
  export const createDirectory = ts.sys.createDirectory;
  export const readDirectory = ts.sys.readDirectory;

  export function deleteFile(filePath: string) {
    filePath = resolvePath(filePath);
    if (fileExists(filePath) && typeof ts.sys.deleteFile === "function") {
      ts.sys.deleteFile(filePath);
    }
  }
  export function emitError(message?: string, options?: ErrorOptions) {
    return new Error(message, options);
  }
  export function dirname(path?: string) {
    if (!path) return ".";
    let code = path.charCodeAt(0);
    const hasRoot = code === 47; /*/*/
    let end = -1;
    let matchedSlash = true;
    for (let i = path.length - 1; i >= 1; --i) {
      code = path.charCodeAt(i);
      if (code === 47 /*/*/) {
        if (!matchedSlash) {
          end = i;
          break;
        }
      } else {
        // We saw the first non-path separator
        matchedSlash = false;
      }
    }
    if (end === -1) return hasRoot ? "/" : ".";
    if (hasRoot && end === 1) return "//";
    return path.slice(0, end);
  }

  export function modifyPath(path: string) {
    const match = path.match(/^\.+/);
    if (match) {
      const length = match[0].length + 1;
      return path.slice(length).trim();
    } else {
      return path;
    }
  }

  export function pathJoin(...args: string[]) {
    if (args.length === 0) return ".";
    let joinedPath: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg && arg.length > 0) {
        if (joinedPath === undefined) {
          joinedPath = arg;
        } else {
          joinedPath += `/${arg}`;
        }
      }
    }
    if (joinedPath === undefined) return ".";
    return modifyPath(joinedPath);
  }

  export function readFile(filePath: string) {
    const resolvedFilePath = resolvePath(filePath);
    if (!fileExists(resolvedFilePath))
      throw emitError(`${filePath} does not exist.`);
    const content = ts.sys.readFile(resolvedFilePath, "utf8");
    if (content) {
      return content;
    } else {
      console.warn(`When reading ${filePath} received content is blank.`);
      return "";
    }
  }

  export async function clearFolder(folderPath: string) {
    folderPath = path.resolve(process.cwd(), folderPath);
    try {
      const entries = await fs.promises.readdir(folderPath, {
        withFileTypes: true,
      });
      await Promise.all(
        entries.map((entry) =>
          fs.promises.rm(path.join(folderPath, entry.name), {
            recursive: true,
          }),
        ),
      );
    } catch (error) {
      // biome-ignore lint/suspicious/noExplicitAny: error code
      if ((error as any).code !== "ENOENT") {
        throw error;
      }
    }
  }

  export async function writeCompileFile(
    file: string,
    content: string,
  ): Promise<void> {
    const filePath = ts.sys.resolvePath(file);
    const dir = path.dirname(filePath);
    if (!ts.sys.directoryExists(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    await wait(500);
    await fs.promises.writeFile(filePath, content);
  }

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

  export const checkModuleType = (sourceFile: ts.SourceFile, file: string) => {
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

  export function findProperty(node: ts.Node) {
    const properties: string[] = [];
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      properties.push(node.expression.text);
    }

    node.forEachChild((n) => findProperty(n));
    return properties;
  }
}

export default utilities;
