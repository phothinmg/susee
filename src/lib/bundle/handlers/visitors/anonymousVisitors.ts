import path from "node:path";
import type { NamesSets } from "susee-types";
import ts from "typescript";
import { uniqueName } from "./uniqueName.js";

const anonymousExportNameMap: NamesSets = [];
const anonymousImportNameMap: NamesSets = [];

const anonymousPrefixKey = "AnonymousName";

const createAnonymousNameGenerator = () =>
  uniqueName.setPrefix({
    key: anonymousPrefixKey,
    value: "__anonymous__",
  });

let anonymousName = createAnonymousNameGenerator();

export const anonymousVisitors = {
  resetAnonymousState() {
    anonymousExportNameMap.length = 0;
    anonymousImportNameMap.length = 0;
    anonymousName = createAnonymousNameGenerator();
  },

  calledExpressions(context: ts.TransformationContext, file: string) {
    const { factory } = context;
    function visitor(node: ts.Node): ts.Node {
      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression)) {
          const base = node.expression.text;
          const mapping = anonymousImportNameMap.find(
            (m) => m.base === base && m.file === file,
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
          const mapping = anonymousImportNameMap.find(
            (m) => m.base === base && m.file === file,
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
          const mapping = anonymousImportNameMap.find(
            (m) => m.base === base && m.file === file,
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
          const mapping = anonymousImportNameMap.find(
            (m) => m.base === base && m.file === file,
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

      return ts.visitEachChild(node, visitor, context);
    }
    return visitor;
  }, //
  exports(
    context: ts.TransformationContext,
    file: string,
    sourceFile: ts.SourceFile,
  ) {
    const { factory } = context;
    function visitor(node: ts.Node): ts.Node {
      const fileName = path.basename(file).split(".")[0] as string;
      if (
        (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
        node.name === undefined
      ) {
        let exp = false;
        let def = false;
        node.modifiers?.forEach((mod) => {
          if (mod.kind === ts.SyntaxKind.ExportKeyword) {
            exp = true;
          }
          if (mod.kind === ts.SyntaxKind.DefaultKeyword) {
            def = true;
          }
        });
        if (exp && def) {
          const base = anonymousName.getName(anonymousPrefixKey, fileName);
          anonymousExportNameMap.push({
            base,
            file: fileName,
            newName: base,
            isEd: true,
          });
          if (ts.isFunctionDeclaration(node)) {
            return factory.updateFunctionDeclaration(
              node,
              node.modifiers,
              node.asteriskToken,
              factory.createIdentifier(base),
              node.typeParameters,
              node.parameters,
              node.type,
              node.body,
            );
          } else if (ts.isClassDeclaration(node)) {
            return factory.updateClassDeclaration(
              node,
              node.modifiers,
              factory.createIdentifier(base),
              node.typeParameters,
              node.heritageClauses,
              node.members,
            );
          }
        }
      } else if (
        ts.isExportAssignment(node) &&
        !node.isExportEquals &&
        node.name === undefined
      ) {
        if (ts.isArrowFunction(node.expression)) {
          const base = anonymousName.getName(anonymousPrefixKey, fileName);
          const arrowFunctionNode = factory.createArrowFunction(
            node.expression.modifiers,
            node.expression.typeParameters,
            node.expression.parameters,
            node.expression.type,
            node.expression.equalsGreaterThanToken,
            node.expression.body,
          );
          const variableDeclarationNode = factory.createVariableDeclaration(
            factory.createIdentifier(base),
            node.expression.exclamationToken,
            node.expression.type,
            arrowFunctionNode,
          );
          const variableDeclarationListNode =
            factory.createVariableDeclarationList(
              [variableDeclarationNode],
              ts.NodeFlags.Const,
            );

          const variableStatementNode = factory.createVariableStatement(
            node.expression.modifiers,
            variableDeclarationListNode,
          );
          const exportAssignmentNode = factory.createExportAssignment(
            undefined,
            undefined,
            factory.createIdentifier(base),
          );
          anonymousExportNameMap.push({
            base,
            file: fileName,
            newName: base,
            isEd: true,
          });
          return factory.updateSourceFile(
            sourceFile,
            [variableStatementNode, exportAssignmentNode],
            sourceFile.isDeclarationFile,
            sourceFile.referencedFiles,
            sourceFile.typeReferenceDirectives,
            sourceFile.hasNoDefaultLib,
            sourceFile.libReferenceDirectives,
          );
        } else if (ts.isObjectLiteralExpression(node.expression)) {
          const base = anonymousName.getName(anonymousPrefixKey, fileName);
          const variableDeclarationNode = factory.createVariableDeclaration(
            factory.createIdentifier(base),
            undefined,
            undefined,
            node.expression,
          );
          const variableDeclarationListNode =
            factory.createVariableDeclarationList(
              [variableDeclarationNode],
              ts.NodeFlags.Const,
            );

          const variableStatementNode = factory.createVariableStatement(
            undefined,
            variableDeclarationListNode,
          );
          const exportAssignmentNode = factory.createExportAssignment(
            undefined,
            undefined,
            factory.createIdentifier(base),
          );
          anonymousExportNameMap.push({
            base,
            file: fileName,
            newName: base,
            isEd: true,
          });
          return factory.updateSourceFile(
            sourceFile,
            [variableStatementNode, exportAssignmentNode],
            sourceFile.isDeclarationFile,
            sourceFile.referencedFiles,
            sourceFile.typeReferenceDirectives,
            sourceFile.hasNoDefaultLib,
            sourceFile.libReferenceDirectives,
          );
        } else if (ts.isArrayLiteralExpression(node.expression)) {
          const base = anonymousName.getName(anonymousPrefixKey, fileName);
          const arrayLiteralExpressionNode =
            factory.createArrayLiteralExpression(
              node.expression.elements,
              true,
            );
          const variableDeclarationNode = factory.createVariableDeclaration(
            factory.createIdentifier(base),
            undefined,
            undefined,
            arrayLiteralExpressionNode,
          );
          const variableDeclarationListNode =
            factory.createVariableDeclarationList(
              [variableDeclarationNode],
              ts.NodeFlags.Const,
            );

          const variableStatementNode = factory.createVariableStatement(
            undefined,
            variableDeclarationListNode,
          );
          const exportAssignmentNode = factory.createExportAssignment(
            undefined,
            undefined,
            factory.createIdentifier(base),
          );
          anonymousExportNameMap.push({
            base,
            file: fileName,
            newName: base,
            isEd: true,
          });
          return factory.updateSourceFile(
            sourceFile,
            [variableStatementNode, exportAssignmentNode],
            sourceFile.isDeclarationFile,
            sourceFile.referencedFiles,
            sourceFile.typeReferenceDirectives,
            sourceFile.hasNoDefaultLib,
            sourceFile.libReferenceDirectives,
          );
        } else if (ts.isStringLiteral(node.expression)) {
          const base = anonymousName.getName(anonymousPrefixKey, fileName);
          const stringLiteralNode = factory.createStringLiteral(
            node.expression.text,
          );
          const variableDeclarationNode = factory.createVariableDeclaration(
            factory.createIdentifier(base),
            undefined,
            undefined,
            stringLiteralNode,
          );
          const variableDeclarationListNode =
            factory.createVariableDeclarationList(
              [variableDeclarationNode],
              ts.NodeFlags.Const,
            );

          const variableStatementNode = factory.createVariableStatement(
            undefined,
            variableDeclarationListNode,
          );
          const exportAssignmentNode = factory.createExportAssignment(
            undefined,
            undefined,
            factory.createIdentifier(base),
          );
          anonymousExportNameMap.push({
            base,
            file: fileName,
            newName: base,
            isEd: true,
          });
          return factory.updateSourceFile(
            sourceFile,
            [variableStatementNode, exportAssignmentNode],
            sourceFile.isDeclarationFile,
            sourceFile.referencedFiles,
            sourceFile.typeReferenceDirectives,
            sourceFile.hasNoDefaultLib,
            sourceFile.libReferenceDirectives,
          );
        } else if (ts.isNumericLiteral(node.expression)) {
          const base = anonymousName.getName(anonymousPrefixKey, fileName);
          const numericLiteralNode = factory.createNumericLiteral(
            node.expression.text,
          );
          const variableDeclarationNode = factory.createVariableDeclaration(
            factory.createIdentifier(base),
            undefined,
            undefined,
            numericLiteralNode,
          );
          const variableDeclarationListNode =
            factory.createVariableDeclarationList(
              [variableDeclarationNode],
              ts.NodeFlags.Const,
            );

          const variableStatementNode = factory.createVariableStatement(
            undefined,
            variableDeclarationListNode,
          );
          const exportAssignmentNode = factory.createExportAssignment(
            undefined,
            undefined,
            factory.createIdentifier(base),
          );
          anonymousExportNameMap.push({
            base,
            file: fileName,
            newName: base,
            isEd: true,
          });
          return factory.updateSourceFile(
            sourceFile,
            [variableStatementNode, exportAssignmentNode],
            sourceFile.isDeclarationFile,
            sourceFile.referencedFiles,
            sourceFile.typeReferenceDirectives,
            sourceFile.hasNoDefaultLib,
            sourceFile.libReferenceDirectives,
          );
        }
      } //

      return ts.visitEachChild(node, visitor, context);
    }
    return visitor;
  }, //
  imports(
    context: ts.TransformationContext,
    file: string,
    sourceFile: ts.SourceFile,
  ) {
    const { factory } = context;
    function visitor(node: ts.Node): ts.Node {
      if (ts.isImportDeclaration(node)) {
        const fileName = node.moduleSpecifier.getText(sourceFile);
        const _name = (path.basename(fileName).split(".")[0] as string).trim();
        // check only import default expression
        if (
          node.importClause?.name &&
          ts.isIdentifier(node.importClause.name)
        ) {
          const base = node.importClause.name.text.trim();
          const mapping = anonymousExportNameMap.find((v) => v.file === _name);
          if (mapping) {
            anonymousImportNameMap.push({
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
    }
    return visitor;
  }, //
};
