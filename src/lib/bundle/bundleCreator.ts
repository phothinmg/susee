import transformFunction from "@suseejs/transformer";
import type { BundleCreator, DepsFile } from "@suseejs/types";
import ts from "typescript";

const bundleCreator: BundleCreator = (
	bundleVisitor,
	compilerOptions,
	...args
) => {
	return (depsTree) => {
		const sourceFile = ts.createSourceFile(
			depsTree.file,
			depsTree.content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const visitor = bundleVisitor(context, depsTree, sourceFile, ...args);
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		};
		let _content = transformFunction(transformer, sourceFile, compilerOptions);
		_content = _content.replace(/^s*;\s*$/gm, "").trim();
		const { content, ...rest } = depsTree;
		return { content: _content, ...rest } as DepsFile;
	};
};

export default bundleCreator;
