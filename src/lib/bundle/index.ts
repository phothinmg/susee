import path from "node:path";
import tcolor from "@suseejs/tcolor";
import type {
	DependenciesFiles,
	SuseePlugin,
	SuseePluginFunction,
} from "@suseejs/types";
import utils from "@suseejs/utils";
import type {
	InitializePoint,
	InitializeResult,
} from "../initialization/index.js";
import { anonymousHandler } from "./anonymous.js";
import { duplicates } from "./duplicate.js";
import { mergeImportsStatement } from "./mergeImports.js";
import { removeHandlers } from "./removes.js";
import { clearUnusedCode } from "./unusedCode.js";

// ------------------------------------------------------------------------------------//
export interface BundlePoint extends InitializePoint {
	bundledContent: string;
}
export interface BundledResult {
	points: BundlePoint[];
	allowUpdatePackageJson: boolean;
}
// ------------------------------------------------------------------------------------//

/**
 * Applies an array of pre-process plugins to the given code.
 * Pre-process plugins are of type "pre-process" and transform the given code.
 * The plugins are applied in order and the result of the previous plugin is given as input to the next plugin.
 * @param plugins - An array of plugins to apply.
 * @param code - The code to transform.
 * @param file - An optional file name to pass to the plugins.
 * @returns The transformed code.
 */
async function preProcessPluginParser(
	plugins: (SuseePlugin | SuseePluginFunction)[],
	code: string,
	file?: string | undefined,
) {
	if (plugins.length) {
		for (const plugin of plugins) {
			const _plugin = typeof plugin === "function" ? plugin() : plugin;
			if (_plugin.type === "pre-process") {
				if (_plugin.async) {
					code = await _plugin.func(code, file);
				} else {
					code = _plugin.func(code, file);
				}
			}
		}
	}
	return code;
}

// ----------------------------------------------------------------------------------

async function bundler(point: InitializePoint): Promise<BundlePoint> {
	const _name =
		point.exportPath === "."
			? "Main"
			: utils.str.splitCamelCase(point.exportPath.slice(2));
	console.time(
		`      > ${tcolor.cyan(`Bundled`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
	);
	let depsFiles = point.depFiles;
	const reName = point.rename;
	const compilerOptions = point.tsOptions.default;
	const plugins = point.plugins;
	let removedStatements: string[] = [];

	// Handling anonymous imports and exports
	depsFiles = await anonymousHandler(depsFiles, compilerOptions);
	// Remove Imports
	const removed = await removeHandlers(removedStatements, compilerOptions);
	depsFiles = depsFiles.map(removed[0]);
	// Remove Exports from dependencies only
	// not remove exports from entry file
	const deps_files = depsFiles
		.slice(0, -1)
		.map(removed[1]) as DependenciesFiles;
	const mainFile = depsFiles.slice(-1);
	// Handle imported statements
	// filter removed statements , that not from local like `./` or `../`
	const regexp = /["']((?!\.\/|\.\.\/)[^"']+)["']/;
	removedStatements = removedStatements.filter((i) => regexp.test(i));
	removedStatements = mergeImportsStatement(removedStatements);
	// Create final content
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
	// text join order is important here
	let content = `${importStatements}\n${depFilesContent}\n${mainFileContent}`;
	// remove ;
	content = content.replace(/^s*;\s*$/gm, "").trim();

	if (reName) {
		content = duplicates(content, point.fileName, compilerOptions);
	}
	content = clearUnusedCode(content, point.fileName, compilerOptions);

	// Call pre-process plugins
	content = await preProcessPluginParser(plugins, content);
	// Returns
	console.timeEnd(
		`      > ${tcolor.cyan(`Bundled`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
	);
	return { bundledContent: content, ...point } as BundlePoint;
}

async function bundle(object: InitializeResult) {
	const points: BundlePoint[] = [];
	for (const point of object.points) {
		const _point = await bundler(point);
		points.push(_point);
	}
	return {
		points,
		allowUpdatePackageJson: object.allowUpdatePackageJson,
	} as BundledResult;
}

export { bundle };
