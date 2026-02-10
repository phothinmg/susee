import path from "node:path";
import resolves from "@phothinmaung/resolves";
import type {
	BundledResult,
	BundleResultPoint,
	CollatedPoint,
	CollatedReturn,
	DuplicatesNameMap,
	NamesSets,
} from "@suseejs/types";
import utilities from "@suseejs/utils";
import bundleCreator from "./bundleCreator.js";
import mergeImportsStatement from "./mergeImportsStatement.js";
// anonymous -------------------------------------------------------------------------//
import anonymousCallExpressionVisitor from "./visitors/anonymousCallExpression.js";
import anonymousExportVisitor from "./visitors/anonymousExport.js";
import anonymousImportVisitor from "./visitors/anonymousImport.js";
// duplicate ----------------------------------------------------------------------//
import duplicateCallExpressionVisitor from "./visitors/duplicateCallExpression.js";
import duplicateCollectionVisitor from "./visitors/duplicateCollection.js";
import duplicateExportExpressionVisitor from "./visitors/duplicateExportExpression.js";
import duplicateImportExpressionVisitor from "./visitors/duplicateImportExpression.js";
import duplicateUpdateVisitor from "./visitors/duplicateUpdate.js";
import removeExportsVisitor from "./visitors/removeExports.js";
// remove ------------------------------------------------------------------------------//
import removeImportsVisitor from "./visitors/removeImports.js";

// ------------------------------------------------------------------------------------//

/**
 * Bundles a TypeScript project into a single file.
 * This function takes a {@link CollatedPoint} object as input and returns a {@link BundleResultPoint} object.
 * The function applies the following steps:
 * 1. Call dependency plugins.
 * 2. Handle duplicates.
 * 3. Handling anonymous imports and exports.
 * 4. Remove Imports.
 * 5. Remove Exports from dependencies only.
 * 6. Handle imported statements.
 * 7. Create final content.
 * 8. Call pre-process plugins.
 * 9. Returns.
 * @param {CollatedPoint} point - A {@link CollatedPoint} object.
 * @returns {Promise<BundleResultPoint>} - A promise resolves with a {@link BundleResultPoint} object.
 */
async function bundler(point: CollatedPoint): Promise<BundleResultPoint> {
	let depsFiles = point.depFiles;
	const reName = point.rename;
	const compilerOptions = point.tsOptions.default;
	const plugins = point.plugins;
	// construct maps
	const namesMap: DuplicatesNameMap = new Map();
	const callNameMap: NamesSets = [];
	const importNameMap: NamesSets = [];
	const exportNameMap: NamesSets = [];
	const exportDefaultExportNameMap: NamesSets = [];
	const exportDefaultImportNameMap: NamesSets = [];
	let removedStatements: string[] = [];

	const duplicate = async (reName: boolean) => {
		if (reName) {
			// order is important here
			const re_name = resolves([
				// collector
				[bundleCreator, duplicateCollectionVisitor, compilerOptions, namesMap],
				// update
				[
					bundleCreator,
					duplicateUpdateVisitor,
					compilerOptions,
					namesMap,
					callNameMap,
				],
				// call exp
				[
					bundleCreator,
					duplicateCallExpressionVisitor,
					compilerOptions,
					callNameMap,
					importNameMap,
				],
				// export exp
				[
					bundleCreator,
					duplicateExportExpressionVisitor,
					compilerOptions,
					importNameMap,
					exportNameMap,
				],
				// import exp
				[
					bundleCreator,
					duplicateImportExpressionVisitor,
					compilerOptions,
					exportNameMap,
					importNameMap,
				],
				// export exp again
				[
					bundleCreator,
					duplicateExportExpressionVisitor,
					compilerOptions,
					importNameMap,
					exportNameMap,
				],
				// export exp again
				[
					bundleCreator,
					duplicateExportExpressionVisitor,
					compilerOptions,
					importNameMap,
					exportNameMap,
				],
			]); // re_name
			const re_name_call = await re_name.concurrent();
			for (const call of re_name_call) {
				await utilities.wait(500);
				depsFiles = depsFiles.map(call);
			}
		} else {
			let _err = false;
			const un_rename = resolves([
				// collector
				[bundleCreator, duplicateCollectionVisitor, compilerOptions, namesMap],
			]);
			const un_rename_call = await un_rename.concurrent();
			depsFiles.map(un_rename_call[0]);
			await utilities.wait(1000);
			namesMap.forEach((files, name) => {
				if (files.size > 1) {
					_err = true;
					console.warn(`Name -> ${name} declared in multiple files :`);
					// biome-ignore lint/suspicious/useIterableCallbackReturn : just log warn
					files.forEach((f) => console.warn(`  - ${f.file}`));
				}
			});
			await utilities.wait(1000);
			if (_err) {
				process.exit(1);
			}
		}
	};

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
	await duplicate(reName);
	// 3. Handling anonymous imports and exports
	const anonymous = resolves([
		[
			bundleCreator,
			anonymousExportVisitor,
			compilerOptions,
			exportDefaultExportNameMap,
		],
		[
			bundleCreator,
			anonymousImportVisitor,
			compilerOptions,
			exportDefaultImportNameMap,
			exportDefaultImportNameMap,
		],
		[
			bundleCreator,
			anonymousCallExpressionVisitor,
			compilerOptions,
			exportDefaultImportNameMap,
		],
	]);
	const anonymousCall = await anonymous.concurrent();
	for (const call of anonymousCall) {
		depsFiles = depsFiles.map(call);
	}
	await utilities.wait(1000);
	// 4. Remove Imports
	const removeImports = resolves([
		[bundleCreator, removeImportsVisitor, compilerOptions, removedStatements],
	]);
	const removeImport = await removeImports.concurrent();
	depsFiles = depsFiles.map(removeImport[0]);
	await utilities.wait(500);
	// 5. Remove Exports from dependencies only
	const removeExports = resolves([
		[bundleCreator, removeExportsVisitor, compilerOptions],
	]);
	const removeExport = await removeExports.concurrent();
	// not remove exports from entry file
	const deps_files = depsFiles.slice(0, -1).map(removeExport[0]);
	const mainFile = depsFiles.slice(-1);
	// 6. Handle imported statements
	// filter removed statements , that not from local like `./` or `../`
	const regexp = /["']((?!\.\/|\.\.\/)[^"']+)["']/;
	removedStatements = removedStatements.filter((i) => regexp.test(i));
	removedStatements = mergeImportsStatement(removedStatements);
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
	return { bundledContent: content, ...point } as BundleResultPoint;
}

async function bundle(object: CollatedReturn) {
	const points: BundleResultPoint[] = [];
	for (const point of object.points) {
		const _point = await bundler(point);
		points.push(_point);
	}
	return {
		points,
		allowUpdatePackageJson: object.allowUpdatePackageJson,
	} as BundledResult;
}

export default bundle;
