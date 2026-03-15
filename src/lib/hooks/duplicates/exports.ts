import transformFunction from "@suseejs/transformer";
import type {
  BundleHandler,
  DependenciesFile,
  NamesSets,
} from "@suseejs/types";
import ts from "typescript";
import { getFileKey } from "./helpers.js";

const duplicateExportHandler = (
  compilerOptions: ts.CompilerOptions,
  callNameMap: NamesSets,
  importNameMap: NamesSets,
  exportNameMap: NamesSets,
): BundleHandler => {
  return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
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
      /* --------------------Returns for transformer function--------------------------------- */
      return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
    }; // transformer;
    /* --------------------Returns for main handler function--------------------------------- */
    const _content = transformFunction(
      transformer,
      sourceFile,
      compilerOptions,
    );
    return { file, content: _content, ...rest };
  }; // returns
};

export default duplicateExportHandler;
