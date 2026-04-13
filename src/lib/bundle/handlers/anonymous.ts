import transformFunction from "susee-transform";
import type { BundleHandler, DependenciesFile } from "susee-types";
import ts from "typescript";
import { promiseResolve } from "../../utils/promiseResolve.js";
import { anonymousVisitors } from "./visitors/anonymousVisitors.js";

/**
 * A bundle handler that takes a list of source files and transforms them into renamed source files.
 * The transformation is done in a series of steps, each step transforms the source files based on the given maps.
 * The order of the steps is important, as it will determine the final output.
 * @param deps - A list of source files to be transformed.
 * @param compilerOptions - The options for the TypeScript compiler.
 * @returns A list of transformed source files.
 */
function anonymousCallExpressionHandler(
	compilerOptions: ts.CompilerOptions,
): BundleHandler {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const visitor = anonymousVisitors.calledExpressions(context, file);
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		};
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, ...rest };
	};
}

/**
 * A transformer that handles anonymous default exports by assigning them a name
 *
 */
function anonymousExportHandler(
	compilerOptions: ts.CompilerOptions,
): BundleHandler {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		/**
		 * A transformer that handles anonymous default exports by assigning them a name
		 *
		 * @param {ts.TransformationContext} context - transformation context
		 * @returns {ts.Transformer<ts.SourceFile>} - transformer
		 */
		const transformer: ts.TransformerFactory<ts.SourceFile> = (
			context: ts.TransformationContext,
		): ts.Transformer<ts.SourceFile> => {
			const visitor = anonymousVisitors.exports(context, file, sourceFile);
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		};
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, ...rest };
	};
}

/**
 * A bundle handler that takes a list of source files and transforms them into renamed source files.
 * The transformation is done in a series of steps, each step transforms the source files based on the given maps.
 * The order of the steps is important, as it will determine the final output.
 * @param compilerOptions - The options for the TypeScript compiler.
 * @returns A list of transformed source files.
 */
function anonymousImportHandler(
	compilerOptions: ts.CompilerOptions,
): BundleHandler {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const visitor = anonymousVisitors.imports(context, file, sourceFile);
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		};
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, ...rest };
	};
}
/**
 * A bundle handler that takes a list of source files and transforms them into renamed source files.
 * The transformation is done in a series of steps, each step transforms the source files based on the given maps.
 * The order of the steps is important, as it will determine the final output.
 * @param deps - A list of source files to be transformed.
 * @param compilerOptions - The options for the TypeScript compiler.
 * @returns A list of transformed source files.
 */
const anonymousHandler = async (
	deps: DependenciesFile[],
	compilerOptions: ts.CompilerOptions,
): Promise<DependenciesFile[]> => {
	anonymousVisitors.resetAnonymousState();
	const anonymous = promiseResolve([
		[anonymousExportHandler, compilerOptions],
		[anonymousImportHandler, compilerOptions],
		[anonymousCallExpressionHandler, compilerOptions],
	]);
	const anons = await anonymous.concurrent();
	for (const anon of anons) {
		deps = deps.map(anon);
	}
	return deps;
};

export { anonymousHandler };
