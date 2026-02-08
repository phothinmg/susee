import path from "node:path";
import resolves from "@phothinmaung/resolves";
import anonymous from "@suseejs/anonymous";
import duplicateHandlers from "@suseejs/duplicates";
import type {
	BundleResult,
	DuplicatesNameMap,
	InitCollationsResult,
	NamesSets,
} from "../types_def.js";
import utilities from "../utils.js";
import createBundleHandler from "./create_bundleHandler.js";
import mergeImports from "./merge_imports.js";
import esmExportsVisitor from "./remove/esmExports.js";
import importsAllVisitor from "./remove/importsAll.js";

export default async function bundle(
	obj: InitCollationsResult,
): Promise<BundleResult> {
	let depsFiles = obj.dependencyFilesObject;
	const reName = obj.allowRenameDuplicates ?? true;
	const compilerOptions = obj.tsOptions.defaultCompilerOptions;
	const plugins = obj.plugins;
	// construct maps
	const namesMap: DuplicatesNameMap = new Map();
	const callNameMap: NamesSets = [];
	const importNameMap: NamesSets = [];
	const exportNameMap: NamesSets = [];
	const exportDefaultExportNameMap: NamesSets = [];
	const exportDefaultImportNameMap: NamesSets = [];
	let removedStatements: string[] = [];
	// 1. Call dependency plugins
	if (plugins.length) {
		for (let plugin of plugins) {
			plugin = typeof plugin === "function" ? plugin() : plugin;
			if (plugin.type === "dependency") {
				if (plugin.async) {
					depsFiles = await plugin.func(depsFiles);
				} else {
					depsFiles = plugin.func(depsFiles);
				}
			}
		}
	} //--
	await utilities.wait(1000);
	// 2. Handle duplicates
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
	await utilities.wait(1000);
	// 2. Handling anonymous imports and exports
	depsFiles = await anonymous(
		depsFiles,
		exportDefaultExportNameMap,
		exportDefaultImportNameMap,
		compilerOptions,
	);
	await utilities.wait(500);
	// 3. Handling anonymous imports and exports
	depsFiles = await anonymous(
		depsFiles,
		exportDefaultExportNameMap,
		exportDefaultImportNameMap,
		compilerOptions,
	);
	await utilities.wait(500);
	// 4. Remove Imports
	const removeImports = resolves([
		[
			createBundleHandler,
			compilerOptions,
			importsAllVisitor,
			removedStatements,
		],
	]);
	const removeImport = await removeImports.concurrent();
	depsFiles = depsFiles.map(removeImport[0]);
	await utilities.wait(500);
	// 5. Remove Exports from dependencies only
	const removeExports = resolves([
		[createBundleHandler, compilerOptions, esmExportsVisitor],
	]);
	const removeExport = await removeExports.concurrent();
	// not remove exports from entry file
	const deps_files = depsFiles.slice(0, -1).map(removeExport[0]);
	const mainFile = depsFiles.slice(-1);
	// 6. Handle imported statements
	// filter removed statements , that not from local like `./` or `../`
	const regexp = /["']((?!\.\/|\.\.\/)[^"']+)["']/;
	removedStatements = removedStatements.filter((i) => regexp.test(i));
	removedStatements = mergeImports(removedStatements);
	// 7. Create final content
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
	await utilities.wait(1000);
	// text join order is important here
	let content = `${importStatements}\n${depFilesContent}\n${mainFileContent}`;
	// 8. Call pre-process plugins
	if (plugins.length) {
		for (let plugin of plugins) {
			plugin = typeof plugin === "function" ? plugin() : plugin;
			if (plugin.type === "pre-process") {
				if (plugin.async) {
					content = await plugin.func(content);
				} else {
					content = plugin.func(content);
				}
			}
		}
	} //--
	// 9. Returns
	const { dependencyFilesObject, ...rest } = obj;
	return {
		bundleContent: content,
		...rest,
	};
}
