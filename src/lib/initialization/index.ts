import type {
	DependenciesFiles,
	SuseePlugin,
	SuseePluginFunction,
} from "@suseejs/types";
import ts from "typescript";
import InternalHooks from "../hooks/index.js";
import utils from "../utils.js";
import finalCompilerOptions from "./compilerOptions.js";
import generateDependencies from "./dependencies.js";
import finalSuseeConfig from "./suseeConfig.js";
import typeCheck from "./typeCheck.js";

export interface InitializedPoint {
	fileName: string;
	exportPath: "." | `./${string}`;
	format: "commonjs" | "esm" | "both";
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
	const suseeFinalConfig = await finalSuseeConfig();
	const points = suseeFinalConfig.points;
	const plugins = suseeFinalConfig.plugins;
	const result: InitializedPoint[] = [];
	for (const point of points) {
		const tsCompilerOptions = finalCompilerOptions(point);
		let depsFiles = await generateDependencies(point.entry);
		const typeChecked = await typeCheck(depsFiles, tsCompilerOptions.esm);
		if (!typeChecked) {
			ts.sys.exit(1);
		}
		// call dependency plugins and hooks
		depsFiles = await utils.plugins.depPluginParser(
			plugins,
			depsFiles,
			tsCompilerOptions.default,
		);
		// ---
		depsFiles = await InternalHooks.depHooksParser(
			InternalHooks.getDepHooks(),
			depsFiles,
			tsCompilerOptions.default,
			point.renameDuplicates,
		);
		// --
		const c = {
			fileName: point.entry,
			exportPath: point.exportPath,
			format: point.format,
			outDir: point.outDirPath,
			tsOptions: {
				cjs: tsCompilerOptions.commonjs,
				esm: tsCompilerOptions.esm,
				default: tsCompilerOptions.default,
			},
			depFiles: depsFiles,
			plugins: plugins,
		} as InitializedPoint;
		result.push(c);
	}
	return {
		points: result,
		allowUpdatePackageJson: suseeFinalConfig.allowUpdatePackageJson,
	} as InitializedResult;
}

export default initializer;
