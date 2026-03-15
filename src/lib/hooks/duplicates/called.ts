import transformFunction from "@suseejs/transformer";
import type {
  BundleHandler,
  DependenciesFile,
  NamesSets,
} from "@suseejs/types";
import ts from "typescript";

const duplicateCallExpressionHandler = (
  compilerOptions: ts.CompilerOptions,
  callNameMap: NamesSets,
  importNameMap: NamesSets,
): BundleHandler => {
  return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const getNewName = (base: string) => {
      let new_name: string | null = null;
      const mapping = callNameMap.find(
        (m) => m.base === base && m.file === file,
      );
      const importMapping = importNameMap.find(
        (m) => m.base === base && m.file === file,
      );
      if (mapping) {
        new_name = mapping.newName;
      } else if (importMapping) {
        new_name = importMapping.newName;
      }
      return new_name;
    };
    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      const { factory } = context;
      const visitor = (node: ts.Node): ts.Node => {
        if (ts.isCallExpression(node)) {
          if (ts.isIdentifier(node.expression)) {
            const base = node.expression.text;
            const new_name = getNewName(base);
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
            const base = node.expression.text;
            const new_name = getNewName(base);
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
            const base = node.expression.text;
            const new_name = getNewName(base);
            if (new_name) {
              return factory.updateNewExpression(
                node,
                factory.createIdentifier(new_name),
                node.typeArguments,
                node.arguments,
              );
            }
          }
        } else if (ts.isVariableDeclaration(node)) {
          if (node.initializer && ts.isIdentifier(node.initializer)) {
            const base = node.initializer.text;
            const new_name = getNewName(base);
            if (new_name) {
              return factory.updateVariableDeclaration(
                node,
                node.name,
                node.exclamationToken,
                node.type,
                factory.createIdentifier(new_name),
              );
            }
          }
        } else if (ts.isReturnStatement(node)) {
          if (node.expression && ts.isIdentifier(node.expression)) {
            const base = node.expression.text;
            const new_name = getNewName(base);
            if (new_name) {
              return factory.updateReturnStatement(
                node,
                factory.createIdentifier(new_name),
              );
            }
          }
        } else if (ts.isPropertyAssignment(node)) {
          if (node.initializer && ts.isIdentifier(node.initializer)) {
            const base = node.initializer.text;
            const new_name = getNewName(base);
            if (new_name) {
              return factory.updatePropertyAssignment(
                node,
                node.name,
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

export default duplicateCallExpressionHandler;
