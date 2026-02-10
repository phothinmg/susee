import ts from "typescript";
import type { BundleVisitor, NodeVisit, NamesSets } from "@suseejs/types";

const anonymousCallExpressionVisitor: BundleVisitor = (
  context,
  depsTree,
  _sourceFile,
  exportDefaultImportNameMap: NamesSets,
) => {
  const { factory } = context;
  const visit: NodeVisit = (node) => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) {
        const base = node.expression.text;
        const mapping = exportDefaultImportNameMap.find(
          (m) => m.base === base && m.file === depsTree.file,
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
          (m) => m.base === base && m.file === depsTree.file,
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
          (m) => m.base === base && m.file === depsTree.file,
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
          (m) => m.base === base && m.file === depsTree.file,
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

    return ts.visitEachChild(node, visit, context);
  };
  return visit;
};

export default anonymousCallExpressionVisitor;
