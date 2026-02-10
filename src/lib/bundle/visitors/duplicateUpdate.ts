// cSpell:disable
import ts from "typescript";
import type {
  BundleVisitor,
  NodeVisit,
  NamesSets,
  DuplicatesNameMap,
} from "@suseejs/types";
import { uniqueName } from "./visitorHelpers.js";

const dupName = uniqueName().setPrefix({
  key: "DuplicatesNames",
  value: "d_",
});

const duplicateUpdateVisitor: BundleVisitor = (
  context,
  depsTree,
  _sourceFile,
  namesMap: DuplicatesNameMap,
  callNameMap: NamesSets,
) => {
  const { factory } = context;
  const visit: NodeVisit = (node) => {
    if (ts.isVariableStatement(node)) {
      const newDeclarations = node.declarationList.declarations.map((decl) => {
        if (ts.isIdentifier(decl.name)) {
          const base = decl.name.text;
          // biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
          if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
            const newName = dupName.getName(base);
            callNameMap.push({ base, file: depsTree.file, newName });
            return factory.updateVariableDeclaration(
              decl,
              factory.createIdentifier(newName),
              decl.exclamationToken,
              decl.type,
              decl.initializer,
            );
          }
        }
        return decl;
      });
      const newDeclList = factory.updateVariableDeclarationList(
        node.declarationList,
        newDeclarations,
      );
      return factory.updateVariableStatement(node, node.modifiers, newDeclList);
    } else if (ts.isFunctionDeclaration(node)) {
      if (node.name && ts.isIdentifier(node.name)) {
        const base = node.name.text;
        // biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
        if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
          const newName = dupName.getName(base);
          callNameMap.push({ base, file: depsTree.file, newName });
          return factory.updateFunctionDeclaration(
            node,
            node.modifiers,
            node.asteriskToken,
            factory.createIdentifier(newName),
            node.typeParameters,
            node.parameters,
            node.type,
            node.body,
          );
        }
      }
    } else if (ts.isClassDeclaration(node)) {
      if (node.name && ts.isIdentifier(node.name)) {
        const base = node.name.text;
        // biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
        if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
          const newName = dupName.getName(base);
          callNameMap.push({ base, file: depsTree.file, newName });
          return factory.updateClassDeclaration(
            node,
            node.modifiers,
            factory.createIdentifier(newName),
            node.typeParameters,
            node.heritageClauses,
            node.members,
          );
        }
      }
    }
    /* ----------------------Returns for visitor function------------------------------- */
    return ts.visitEachChild(node, visit, context);
  };
  return visit;
};

export default duplicateUpdateVisitor;
