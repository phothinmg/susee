import type {
	DependenciesFiles,
	SuseePlugin,
	SuseePluginFunction,
} from "@suseejs/types";
import ts from "typescript";
import { utilities } from "../utils.js";
import { compilerOptions } from "./compilerOptions.js";
import { generateDependencies } from "./dependencies.js";
import { finalSuseeConfig } from "./suseeConfig.js";
import { typeCheck } from "./typeCheck.js";

export interface InitializePoint {
	fileName: string;
	exportPath: "." | `./${string}`;
	format: "commonjs" | "esm" | "both";
	rename: boolean;
	outDir: string;
	tsOptions: {
		cjs: ts.CompilerOptions;
		esm: ts.CompilerOptions;
		default: ts.CompilerOptions;
	};
	depFiles: DependenciesFiles;
	plugins: (SuseePlugin | SuseePluginFunction)[];
}

export interface InitializeResult {
	points: InitializePoint[];
	allowUpdatePackageJson: boolean;
}

/**
 * Applies an array of dependency plugins to the given DependenciesFiles.
 * Dependency plugins are of type "dependency" and transform the given DependenciesFiles.
 * The plugins are applied in order and the result of the previous plugin is given as input to the next plugin.
 * @param depFiles - The DependenciesFiles to transform.
 * @param plugins - An array of plugins to apply.
 * @param compilerOptions - The compiler options to pass to the plugins.
 * @returns The transformed DependenciesFiles.
 */
async function depPluginParser(
	depFiles: DependenciesFiles,
	plugins: (SuseePlugin | SuseePluginFunction)[],
	compilerOptions: ts.CompilerOptions,
) {
	if (plugins.length) {
		for (const plugin of plugins) {
			const _plugin = typeof plugin === "function" ? plugin() : plugin;
			if (_plugin.type === "dependency") {
				if (_plugin.async) {
					depFiles = await _plugin.func(depFiles, compilerOptions);
				} else {
					depFiles = _plugin.func(depFiles, compilerOptions);
				}
			}
		}
	}
	return depFiles;
}

/**
 * Initializes the susee bundler by collecting configuration data from the given points.
 * The function takes the given points and applies the dependency plugins and hooks in order.
 * The result is an array of InitializePoint objects containing the collected data from each point.
 * @returns A promise that resolves to an InitializeResult object containing the collected data.
 */
async function initializer(): Promise<InitializeResult> {
	const __config = await finalSuseeConfig();
	const points = __config.points;
	const plugins = __config.plugins;
	const result: InitializePoint[] = [];
	for (const point of points) {
		const __opts = compilerOptions(point);
		let __deps = await generateDependencies(point.entry);
		const typeChecked = await typeCheck(__deps, __opts.esm);
		if (!typeChecked) {
			ts.sys.exit(1);
		}
		// call dependency plugins and hooks
		__deps = await depPluginParser(__deps, plugins, __opts.default);
		await utilities.wait(1000);
		const c = {
			fileName: point.entry,
			exportPath: point.exportPath,
			format: point.format,
			rename: point.renameDuplicates,
			outDir: point.outDirPath,
			tsOptions: {
				cjs: __opts.commonjs,
				esm: __opts.esm,
				default: __opts.default,
			},
			depFiles: __deps,
			plugins: plugins,
		} as InitializePoint;
		result.push(c);
	}
	return {
		points: result,
		allowUpdatePackageJson: __config.allowUpdatePackageJson,
	} as InitializeResult;
}

export { initializer };
