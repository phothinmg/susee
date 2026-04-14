import ts = require("typescript");

/**
 * Applies a given transformer to a source file and returns the modified code.
 * @param transformer A transformer factory that will be called with the source file.
 * @param sourceFile The source file to which the transformer will be applied.
 * @param compilerOptions Compiler options to use when applying the transformer.
 * @returns The modified code after applying the transformer.
 */
function transformFunction(
  transformer: ts.TransformerFactory<ts.SourceFile>,
  sourceFile: ts.SourceFile,
  compilerOptions: ts.CompilerOptions,
) {
  const transformationResult = ts.transform(
    sourceFile,
    [transformer],
    compilerOptions,
  );
  const transformedSourceFile = transformationResult.transformed[0];
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
  });
  const modifiedCode = printer.printFile(
    transformedSourceFile as ts.SourceFile,
  );
  transformationResult.dispose();
  return modifiedCode;
}

export = transformFunction;
