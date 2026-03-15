import path from "node:path";
import transformFunction from "@suseejs/transformer";
import type {
  BundleHandler,
  DependenciesFile,
  NamesSets,
} from "@suseejs/types";
import ts from "typescript";

function anonymousImportHandler(
  compilerOptions: ts.CompilerOptions,
  exportDefaultExportNameMap: NamesSets,
  exportDefaultImportNameMap: NamesSets,
): BundleHandler {
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
        if (ts.isImportDeclaration(node)) {
          const fileName = node.moduleSpecifier.getText(sourceFile);
          const _name = (
            path.basename(fileName).split(".")[0] as string
          ).trim();
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
      };
      return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
    };
    const _content = transformFunction(
      transformer,
      sourceFile,
      compilerOptions,
    );
    return { file, content: _content, ...rest };
  };
}

export default anonymousImportHandler;
