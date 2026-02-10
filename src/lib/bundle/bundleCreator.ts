import transformFunction from "@suseejs/transformer";
import type { BundleCreator, DepsFile } from "@suseejs/types";
import ts from "typescript";

/**
 * Creates a BundleCreator function that transforms a DepsFile with a given BundleVisitor and typescript compiler options.
 * @param {BundleVisitor} bundleVisitor - a BundleVisitor function that takes a context, depsTree, sourceFile, and any number of arguments.
 * @param {ts.CompilerOptions} compilerOptions - typescript compiler options.
 * @param {...any} args - any number of arguments to pass to the BundleVisitor function.
 * @returns {BundleCreator} a BundleCreator function that takes a DepsFile and returns a transformed DepsFile.
 */
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
