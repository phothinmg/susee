import ts from "typescript";
import transformFunction from "@suseejs/transformer";
import type {
  BundleHandler,
  DepsFile,
  BundleVisitorFunc,
} from "../types_def.js";

export default function createBundleHandler(
  compilerOptions: ts.CompilerOptions,
  bundleVisitor: BundleVisitorFunc,
  ...args: any[]
): BundleHandler {
  return ({ file, content }: DepsFile): DepsFile => {
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      const visitor = bundleVisitor(
        context,
        { file, content },
        sourceFile,
        ...args,
      );
      return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
    };
    let _content = transformFunction(transformer, sourceFile, compilerOptions);
    _content = _content.replace(/^s*;\s*$/gm, "").trim();
    return { file, content: _content };
  };
}
