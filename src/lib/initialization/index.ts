import type {
	DependenciesFiles,
	SuseePlugin,
	SuseePluginFunction,
} from "@suseejs/types";
import ts from "typescript";
import { depHooksParser } from "../hooks/calledFunc.js";
import internalHooks from "../hooks/index.js";
import utils from "../utils.js";
import compilerOptions from "./compilerOptions.js";
import generateDependencies from "./dependencies.js";
import finalSuseeConfig from "./suseeConfig.js";
import typeCheck from "./typeCheck.js";

export interface InitializedPoint {
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

export interface InitializedResult {
	points: InitializedPoint[];
	allowUpdatePackageJson: boolean;
}

/**
 * Initializes the susee bundler by collecting configuration data from the given points.
 * The function takes the given points and applies the dependency plugins and hooks in order.
 * The result is an array of InitializePoint objects containing the collected data from each point.
 * @returns A promise that resolves to an InitializeResult object containing the collected data.
 */
async function initializer(): Promise<InitializedResult> {
	const __config = await finalSuseeConfig();
	const points = __config.points;
	const plugins = __config.plugins;
	const result: InitializedPoint[] = [];
	for (const point of points) {
		const __opts = compilerOptions(point);
		let __deps = await generateDependencies(point.entry);
		const typeChecked = await typeCheck(__deps, __opts.esm);
		if (!typeChecked) {
			ts.sys.exit(1);
		}
		// call dependency plugins and hooks
		__deps = await utils.plugins.depPluginParser(
			plugins,
			__deps,
			__opts.default,
		);
		// ---
		__deps = await depHooksParser(
			internalHooks.dep(),
			__deps,
			__opts.default,
			point.renameDuplicates,
		);
		// --
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
		} as InitializedPoint;
		result.push(c);
	}
	return {
		points: result,
		allowUpdatePackageJson: __config.allowUpdatePackageJson,
	} as InitializedResult;
}

export default initializer;
