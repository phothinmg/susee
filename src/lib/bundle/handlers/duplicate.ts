// cSpell:disable
import type {
	BundleHandler,
	DependenciesFile,
	DuplicatesNameMap,
} from "susee-types";
import ts from "typescript";
import { promiseResolve } from "../../utils/promiseResolve.js";
import transformFunction from "./transformer.js";
import { duplicateVisitors } from "./visitors/duplicateVisitor.js";

const duplicateNameMap: DuplicatesNameMap = new Map();

const duplicateCallExpression = (
	compilerOptions: ts.CompilerOptions,
): BundleHandler => {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const visitor = duplicateVisitors.calledExpressions(context, file);
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		}; // transformer;
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, ...rest };
	}; // returns
};

const duplicateExportExpression = (
	compilerOptions: ts.CompilerOptions,
): BundleHandler => {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const visitor = duplicateVisitors.exportExpressions(context, file);
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		}; // transformer;
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, ...rest };
	}; // returns
};

const duplicateImportExpression = (
	compilerOptions: ts.CompilerOptions,
): BundleHandler => {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const visitor = duplicateVisitors.importExpressions(
				context,
				file,
				sourceFile,
			);
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		}; // transformer;
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, ...rest };
	}; // returns
};

const duplicateCollector = (
	compilerOptions: ts.CompilerOptions,
): BundleHandler => {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const visitNode = duplicateVisitors.collector(
				context,
				file,
				duplicateNameMap,
			);
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => visitNode(rootNode, true) as ts.SourceFile;
		}; // transformer;
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, ...rest };
	}; // returns
};

const duplicateUpdater = (
	compilerOptions: ts.CompilerOptions,
): BundleHandler => {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const visitor = duplicateVisitors.updater(
				context,
				file,
				duplicateNameMap,
			);
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		}; // transformer;
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, ...rest };
	}; // returns
};

const duplicateHandlers = {
	/**
	 * A bundle handler that takes a list of source files and transforms them into renamed source files.
	 * The transformation is done in a series of steps, each step transforms the source files based on the given maps.
	 * The order of the steps is important, as it will determine the final output.
	 * @param deps - A list of source files to be transformed.
	 * @param duplicateNameMap - A map of base names to new names for function calls, import expressions, and export expressions.
	 * @param callNameMap - A map of base names to new names for call expressions.
	 * @param importNameMap - A map of base names to new names for import expressions.
	 * @param exportNameMap - A map of base names to new names for export expressions.
	 * @param compilerOptions - The options for the TypeScript compiler.
	 * @returns A list of transformed source files.
	 */
	renamed: async (
		deps: DependenciesFile[],

		compilerOptions: ts.CompilerOptions,
	): Promise<DependenciesFile[]> => {
		duplicateVisitors.resetDuplicateState(duplicateNameMap);
		// order is important here
		const duplicates = promiseResolve([
			[duplicateCollector, compilerOptions],
			[duplicateUpdater, compilerOptions],
			[duplicateCallExpression, compilerOptions],
			[duplicateExportExpression, compilerOptions],
			[duplicateImportExpression, compilerOptions],
			[duplicateCallExpression, compilerOptions],
			[duplicateExportExpression, compilerOptions],
		]);
		const duplicate = await duplicates.concurrent();
		for (const func of duplicate) {
			deps = deps.map(func);
		}
		return deps;
	},
	/**
	 * A bundle handler that takes a list of source files and checks if they have been renamed correctly.
	 * If a source file has not been renamed, an error will be thrown.
	 * @param deps - A list of source files to be checked.
	 * @param duplicateNameMap - A map of base names to new names for function calls, import expressions, and export expressions.
	 * @param compilerOptions - The options for the TypeScript compiler.
	 * @returns A list of source files that have been renamed correctly.
	 */
	notRenamed: async (
		deps: DependenciesFile[],

		compilerOptions: ts.CompilerOptions,
	): Promise<DependenciesFile[]> => {
		duplicateVisitors.resetDuplicateState(duplicateNameMap);
		let _err = false;
		const duplicates = promiseResolve([
			[duplicateCollector, duplicateNameMap, compilerOptions],
		]);
		const duplicate = await duplicates.concurrent();
		deps.map(duplicate[0]);
		duplicateNameMap.forEach((files, name) => {
			if (files.size > 1) {
				_err = true;
				console.warn(`Name -> ${name} declared in multiple files :`);
				// biome-ignore lint/suspicious/useIterableCallbackReturn : just log warn
				files.forEach((f) => console.warn(`  - ${f.file}`));
			}
		});
		if (_err) {
			process.exit(1);
		}
		return deps;
	},
};

export { duplicateHandlers };
