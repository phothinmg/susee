import ts from "typescript";
import path from "node:path";
import type { BundleVisitorFunc, NodeVisit } from "../../types_def.js";
import utilities from "../../utils.js";

const commonJsExportsVisitor: BundleVisitorFunc = (context) => {
  const { factory } = context;
  const visit: NodeVisit = (node) => {
    if (
      ts.isExpressionStatement(node) &&
      ts.isBinaryExpression(node.expression)
    ) {
      const left = node.expression.left;
      const right = node.expression.right;
      if (ts.isPropertyAccessExpression(left)) {
        // for module.exports = ??
        if (
          ts.isIdentifier(left.expression) &&
          left.expression.escapedText === "module" &&
          ts.isIdentifier(left.name) &&
          left.name.escapedText === "exports"
        ) {
          // if module.exports = identifier, remove the whole line
          if (ts.isIdentifier(right)) {
            return factory.createEmptyStatement();
          } else if (ts.isObjectLiteralExpression(right)) {
            // if module.exports = Objects
            const props = right.properties;
            const isIdentifierAll = props.every(
              (p) =>
                ts.isShorthandPropertyAssignment(p) && ts.isIdentifier(p.name),
            );
            if (isIdentifierAll) {
              // all properties of objet are identifiers remove the whole line
              return factory.createEmptyStatement();
            } else {
              // TODO
            }
          } // ObjectLiteralExpression
        } // module.exports
        if (
          ts.isIdentifier(left.expression) &&
          left.expression.escapedText === "exports" &&
          ts.isIdentifier(left.name)
        ) {
          const _name = left.name.text;
          if (ts.isObjectLiteralExpression(right)) {
            const newVarDecl = factory.createVariableDeclaration(
              factory.createIdentifier(_name),
              undefined,
              undefined,
              right,
            );
            const newVarDeclList = factory.createVariableDeclarationList([
              newVarDecl,
            ]);
            return factory.createVariableStatement(undefined, newVarDeclList);
          }
        } // exports.identifier
      } // PropertyAccessExpression
    }

    // --------- Visitor Return ------------------//
    return ts.visitEachChild(node, visit, context);
  };
  return visit;
};
