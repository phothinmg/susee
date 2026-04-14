import ts from "typescript";
import transformFunction from "@suseejs/transformer";
import type { DependenciesFile, BundleHandler } from "@suseejs/types";

/**
 * Transforms a commonjs file into an ES module.
 * @param {ts.CompilerOptions} compilerOptions - The compiler options.
 * @returns {BundleHandler} - A bundle handler that transforms a commonjs file into an ES module.
 */
function commonjsExportsHandler(
  compilerOptions: ts.CompilerOptions,
): BundleHandler {
  return (deps: DependenciesFile) => {
    if (
      deps.moduleType === "cjs" &&
      (deps.fileExt === ".js" || deps.fileExt === ".cjs")
    ) {
      const sourceFile = ts.createSourceFile(
        deps.file,
        deps.content,
        ts.ScriptTarget.Latest,
        true,
      );
      const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
        const { factory } = context;
        const visitor = (node: ts.Node): ts.Node => {
          // for const foo = exports.foo = expression
          if (ts.isVariableStatement(node)) {
            const decls = node.declarationList;
            let vdl = decls.declarations.find(
              (del) => del.initializer !== undefined,
            );
            if (
              vdl &&
              vdl.initializer &&
              ts.isBinaryExpression(vdl.initializer) &&
              ts.isIdentifier(vdl.name)
            ) {
              const name_1 = vdl.name.text;
              const init = vdl.initializer;
              if (
                ts.isPropertyAccessExpression(init.left) &&
                ts.isIdentifier(init.left.expression) &&
                init.left.expression.text === "exports" &&
                ts.isIdentifier(init.left.name)
              ) {
                const name_2 = init.left.name.text;
                if (name_1 === name_2) {
                  return factory.createVariableStatement(
                    [factory.createToken(ts.SyntaxKind.ExportKeyword)],
                    factory.createVariableDeclarationList(
                      [
                        factory.createVariableDeclaration(
                          name_1,
                          undefined,
                          undefined,
                          init.right,
                        ),
                      ],
                      ts.NodeFlags.Const,
                    ),
                  );
                }
              }
            }
          } else if (
            ts.isExpressionStatement(node) &&
            ts.isBinaryExpression(node.expression) &&
            ts.isPropertyAccessExpression(node.expression.left)
          ) {
            const leftExpression = node.expression.left.expression;
            const leftIdentifierName = node.expression.left.name;
            const rn = node.expression.right;
            if (
              ts.isIdentifier(leftExpression) &&
              ts.isIdentifier(leftIdentifierName)
            ) {
              const exprName = leftExpression.text;
              const leftName = leftIdentifierName.text;
              const _exportKeyword = factory.createModifier(
                ts.SyntaxKind.ExportKeyword,
              );
              const _defaultKeyword = factory.createModifier(
                ts.SyntaxKind.DefaultKeyword,
              );
              if (exprName === "module" && leftName === "exports") {
                if (ts.isFunctionExpression(rn)) {
                  return factory.createFunctionDeclaration(
                    [_exportKeyword, _defaultKeyword],
                    rn.asteriskToken,
                    rn.name ?? undefined,
                    rn.typeParameters,
                    rn.parameters,
                    rn.type,
                    rn.body,
                  );
                } else if (ts.isClassExpression(rn)) {
                  return factory.createClassDeclaration(
                    [_exportKeyword, _defaultKeyword],
                    rn.name ?? undefined,
                    rn.typeParameters,
                    rn.heritageClauses,
                    rn.members,
                  );
                } else if (ts.isExpression(rn)) {
                  return factory.createExportAssignment(undefined, false, rn);
                }
              }
              // ================================================================================== //
              else if (exprName === "exports") {
                if (ts.isIdentifier(rn)) {
                  return factory.createExportDeclaration(
                    undefined,
                    false,
                    factory.createNamedExports([
                      factory.createExportSpecifier(false, undefined, rn),
                    ]),
                    undefined,
                    undefined,
                  );
                } else {
                  const _name = factory.createIdentifier(leftName);

                  // function
                  if (ts.isFunctionExpression(rn)) {
                    return factory.createFunctionDeclaration(
                      [_exportKeyword],
                      rn.asteriskToken,
                      _name,
                      rn.typeParameters,
                      rn.parameters,
                      rn.type,
                      rn.body,
                    );
                  } else if (ts.isClassExpression(rn)) {
                    return factory.createClassDeclaration(
                      [_exportKeyword],
                      _name,
                      rn.typeParameters,
                      rn.heritageClauses,
                      rn.members,
                    );
                  } else if (ts.isExpression(rn)) {
                    const varDecl = factory.createVariableDeclaration(
                      _name,
                      undefined,
                      undefined,
                      rn,
                    );
                    return factory.createVariableStatement(
                      [_exportKeyword],
                      factory.createVariableDeclarationList(
                        [varDecl],
                        ts.NodeFlags.Const,
                      ),
                    );
                  }
                }
              }
            }
          }
          /* ----------------------Returns for visitor function------------------------------- */
          return ts.visitEachChild(node, visitor, context);
        };
        /* --------------------Returns for transformer function--------------------------------- */
        return (rootNode) => {
          const visited = ts.visitNode(rootNode, visitor) as ts.SourceFile;
          const nonDefaultStatements: ts.Statement[] = [];
          const defaultStatements: ts.Statement[] = [];

          for (const stmt of visited.statements) {
            if (ts.isExportAssignment(stmt)) {
              defaultStatements.push(stmt);
              continue;
            }

            if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
              const hasExport = stmt.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.ExportKeyword,
              );
              const hasDefault = stmt.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
              );
              if (hasExport && hasDefault) {
                defaultStatements.push(stmt);
                continue;
              }
            }

            nonDefaultStatements.push(stmt);
          }
          // default statement to the last of file
          return factory.updateSourceFile(visited, [
            ...nonDefaultStatements,
            ...defaultStatements,
          ]);
        };
      };
      let _content = transformFunction(
        transformer,
        sourceFile,
        compilerOptions,
      );
      _content = _content.replace(/^s*;\s*$/gm, "").trim();
      const { file, content, ...rest } = deps;
      return { file, content: _content, ...rest } as DependenciesFile;
    } else {
      return deps;
    }
  };
}

export default commonjsExportsHandler;
