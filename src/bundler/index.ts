import path from "node:path";
import resolves from "@phothinmaung/resolves";
import anonymous from "@suseejs/anonymous";
import duplicateHandlers from "@suseejs/duplicates";
import type SuSee from "@suseejs/types";
import utils from "@suseejs/utils";
import type ts from "typescript";
import removeExportExpressionHandler from "./exports.js";
import removeImportExpressionHandler from "./imports.js";
import mergeImports from "./mergeImports.js";

type BundlerOptions = {
	depsFiles: SuSee.DepsFile[];
	compilerOptions: ts.CompilerOptions;
	renameDuplicates?: boolean;
};

/**
 * Bundles dependency files into a single output string by handling duplicate names,
 * anonymous imports/exports, and pruning import/export statements from dependencies.
 *
 * The process:
 * 1. Resolves duplicate identifiers (optionally renaming them).
 * 2. Handles anonymous default imports/exports.
 * 3. Removes import statements and collects removed imports for consolidation.
 * 4. Removes export statements from dependency files (keeps exports in entry file).
 * 5. Merges and hoists external import statements to the top.
 * 6. Concatenates dependency contents before the entry file content.
 *
 * @param options - Bundler configuration including dependency files, compiler options, and rename behavior.
 * @returns A single bundled source string with consolidated imports and ordered file contents.
 */
async function bundler({
	depsFiles,
	compilerOptions,
	renameDuplicates,
}: BundlerOptions): Promise<string> {
	const reName = renameDuplicates ?? true;
	// construct maps
	const namesMap: SuSee.DuplicatesNameMap = new Map();
	const callNameMap: SuSee.NamesSets = [];
	const importNameMap: SuSee.NamesSets = [];
	const exportNameMap: SuSee.NamesSets = [];
	const exportDefaultExportNameMap: SuSee.NamesSets = [];
	const exportDefaultImportNameMap: SuSee.NamesSets = [];
	let removedStatements: string[] = [];
	// 1. Handle duplicates
	if (reName) {
		depsFiles = await duplicateHandlers.renamed(
			depsFiles,
			namesMap,
			callNameMap,
			importNameMap,
			exportNameMap,
			compilerOptions,
		);
	} else {
		depsFiles = await duplicateHandlers.notRenamed(
			depsFiles,
			namesMap,
			compilerOptions,
		);
	}
	await utils.wait(1000);
	// 2. Handling anonymous imports and exports
	depsFiles = await anonymous(
		depsFiles,
		exportDefaultExportNameMap,
		exportDefaultImportNameMap,
		compilerOptions,
	);
	await utils.wait(1000);
	// 3. Remove Imports
	const removeImports = resolves([
		[removeImportExpressionHandler, removedStatements, compilerOptions],
	]);
	const removeImport = await removeImports.concurrent();
	depsFiles = depsFiles.map(removeImport[0]);
	await utils.wait(1000);
	// 4. Remove Exports from dependencies only
	const removeExports = resolves([
		[removeExportExpressionHandler, compilerOptions],
	]);
	const removeExport = await removeExports.concurrent();
	// not remove exports from entry file
	const deps_files = depsFiles.slice(0, -1).map(removeExport[0]);
	const mainFile = depsFiles.slice(-1);
	// 5. Handle imported statements
	// filter removed statements , that not from local like `./` or `../`
	const regexp = /["']((?!\.\/|\.\.\/)[^"']+)["']/;
	removedStatements = removedStatements.filter((i) => regexp.test(i));
	removedStatements = mergeImports(removedStatements);
	// 6. Create final content
	// make sure all imports are at the top of file
	const importStatements = removedStatements.join("\n").trim();
	const depFilesContent = deps_files
		.map((i) => {
			const file = `//${path.relative(process.cwd(), i.file)}`;
			return `${file}\n${i.content}`;
		})
		.join("\n")
		.trim();
	const mainFileContent = mainFile
		.map((i) => {
			const file = `//${path.relative(process.cwd(), i.file)}`;
			return `${file}\n${i.content}`;
		})
		.join("\n")
		.trim();
	await utils.wait(1000);
	// text join order is important here
	const content = `${importStatements}\n${depFilesContent}\n${mainFileContent}`;
	// TODO pre-process hooks call
	return content;
}

export default bundler;
