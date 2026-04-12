import transformFunction from "susee-transform";
import type { BundleHandler, DependenciesFile } from "susee-types";
import ts from "typescript";
import { promiseResolve } from "../../promiseResolve.js";
import { removeVisitors } from "./visitors/removeVisitor.js";

/**
 * A bundle handler that takes a list of source files and transforms them into renamed source files.
 * The transformation is done in a series of steps:
 * - Case 1: Strip "export" modifiers from function, class, interface, type alias, enum and variable declarations.
 * - Case 2: Remove "export { foo }" entirely.
 * - Case 3: Handle "export default ..." by removing the line.
 * @param deps - A list of source files to be transformed.
 * @param compilerOptions - The options for the TypeScript compiler.
 * @returns A list of transformed source files.
 */
function esmExportRemoveHandler(
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
			const visitor = removeVisitors.esmExport(context);
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		};
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, ...rest };
	};
}

/**
 * A bundle handler that removes all imports from the given source files.
 * @param {string[]} removedStatements - An array of strings to be removed from the source files.
 * @param {ts.CompilerOptions} compilerOptions - The options for the TypeScript compiler.
 * @returns {DepFile} - The transformed source file.
 */
function importAllRemoveHandler(
	removedStatements: string[],
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
			const visitor = removeVisitors.allImports(
				context,
				file,
				removedStatements,
				sourceFile,
			);
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		};
		/* --------------------Returns for main handler function--------------------------------- */
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
 * @param removedStatements - A list of statements to be removed from the source files.
 * @param compilerOptions - The options for the TypeScript compiler.
 * @returns A list of transformed source files.
 */
const removeHandlers = async (
	removedStatements: string[],
	compilerOptions: ts.CompilerOptions,
): Promise<[BundleHandler, BundleHandler]> => {
	const resolved = promiseResolve([
		[importAllRemoveHandler, removedStatements, compilerOptions],
		[esmExportRemoveHandler, compilerOptions],
	]);

	return await resolved.series();
};

export { removeHandlers };
