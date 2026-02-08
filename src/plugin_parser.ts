import transformFunction from "@suseejs/transformer";
import ts from "typescript";
import type { ASTPlugin, BundleResult } from "./types_def.js";

const astPluginParser = (
	obj: BundleResult,
	compilerOptions: ts.CompilerOptions,
) => {
	return (p: ASTPlugin): BundleResult => {
		const sourceFile = ts.createSourceFile(
			obj.entryFileName,
			obj.bundleContent,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (
			context: ts.TransformationContext,
		): ts.Transformer<ts.SourceFile> => {
			const { factory } = context;
			const visitor = (node: ts.Node): ts.Node => {
				node = p.func(node, factory, obj.entryFileName);
				return ts.visitEachChild(node, visitor, context);
			};
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		};
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		const { bundleContent, ...rest } = obj;
		return {
			bundleContent: _content,
			...rest,
		};
	};
};

export { astPluginParser };
