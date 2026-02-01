import ts from "typescript";

function checkExports(file: string, str: string) {
  const sourceFile = ts.createSourceFile(
    file,
    str,
    ts.ScriptTarget.Latest,
    true,
  );
  let nameExport = false;
  let defExport = false;
  const transformer: ts.TransformerFactory<ts.SourceFile> = (
    context: ts.TransformationContext,
  ): ts.Transformer<ts.SourceFile> => {
    const visitor = (node: ts.Node) => {
      if (
        ts.isExportAssignment(node) &&
        !node.isExportEquals &&
        node.modifiers === undefined &&
        ts.isIdentifier(node.expression)
      ) {
        defExport = true;
      } else if (
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)
      ) {
        // check ist export default
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
        if (exp && def) defExport = true;
      } else if (
        ts.isExportAssignment(node) &&
        ts.isObjectLiteralExpression(node.expression)
      ) {
        const pros = node.expression.properties;
        for (const pro of pros) {
          if (pro.name && ts.isIdentifier(pro.name)) {
            defExport = true;
          }
        }
      } else if (ts.isNamedExports(node)) {
        nameExport = true;
      } else if (
        ts.isVariableStatement(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node)
      ) {
        const isInsideNamespace = (n: ts.Node) => {
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
        node?.modifiers?.forEach((mod) => {
          if (mod.kind === ts.SyntaxKind.ExportKeyword) {
            if (!isInsideNamespace(node)) {
              nameExport = true;
            }
          }
        });
      }
      return ts.visitEachChild(node, visitor, context);
    };
    return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
  };
  // run the transformer to populate flags
  ts.transform(sourceFile, [transformer]);

  return { nameExport, defExport };
}

export default checkExports;
