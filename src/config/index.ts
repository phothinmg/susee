import tcolor from "@suseejs/color";
import ts6 from "@suseejs/ts6";
import type { SuseePlugin, SuseePluginFunction } from "@suseejs/type";
import type { CheckOptions } from "@suseejs/susee_bundler";

export type OutputFormat = ("commonjs" | "esm")[];
export interface EntryPoint {
	/**
	 * Entry of file path of package
	 *
	 * required
	 */
	entry: string;
	/**
	 * Info for output
	 *
	 * required
	 */
	/**
	 *  path for package
	 *
	 * required
	 */
	exportPath: "." | `./${string}`;
	/**
	 * Output module type of package
	 *
	 * default - [esm]
	 */
	format?: OutputFormat;
	/**
	 * Custom tsconfig.json path for package typescript compiler options
	 *
	 * Priority -
	 *  1. this custom tsconfig.json
	 *  2. tsconfig.json at root directory
	 *  3. default compiler options of susee
	 *
	 * default - undefined
	 *
	 */
	tsconfigFilePath?: string | undefined;
	/**
	 * Array of susee plugins
	 *
	 * default - []
	 */
	plugins?: (SuseePlugin | SuseePluginFunction)[];
	/**
	 * Susee fails the build when duplicate top-level declarations are found across bundled files.
	 * Resolve those conflicts in source files before building.
	 */
	/**
	 * When generating a dependency graph, Susee checks whether referenced npm modules are installed.
	 * If a module is not installed in your project, Susee emits a warning message.
	 * If this option is `true`, Susee treats those warnings as fatal and exits with code 1.
	 *
	 * default - false
	 */
	warning?: boolean;
	checks?:CheckOptions;
}
/**
 * Configuration for Susee Bundler
 */
export interface SuSeeConfig {
	/**
	 * Array of entry points object
	 *
	 * required
	 */
	entryPoints: EntryPoint[];
	/**
	 * Out directory
	 *
	 * default - dist
	 */
	outDir?: string;
	/**
	 * Allow bundler to update your package.json.
	 *
	 * default - false
	 */
	allowUpdatePackageJson?: boolean;
}

/**
 * Finds the path of the susee.config file if it exists.
 * It checks for the existence of "susee.config.ts", "susee.config.js", and "susee.config.mjs" in the current working directory.
 * The first file found is returned.
 * @returns {string | undefined} - path to the susee.config file or undefined if it does not exist.
 */
const getSuseeConfigPath = (): string | undefined => {
	const fileNames = ["susee.config.ts", "susee.config.js", "susee.config.mjs"];
	let configFile: string | undefined;
	for (const file of fileNames) {
		const _file = ts6.sys.resolvePath(file);
		if (ts6.sys.fileExists(_file)) {
			configFile = _file;
			break;
		}
	}
	return configFile;
};

/**
 * Checks if the given entries have at least one entry and if there are any duplicate export paths.
 * If there are no entries, it will exit with code 1 and print an error message.
 * If there are any duplicate export paths, it will exit with code 1 and print an error message.
 * It will also check if each entry file exists, if not, it will exit with code 1 and print an error message.
 * @param {EntryPoint[]} entries - array of entry points
 */
function checkEntries(entries: EntryPoint[]) {
	if (entries.length < 1) {
		console.error(
			tcolor.magenta(
				`No entry found in susee.config file or build options, at least one entry required`,
			),
		);
		ts6.sys.exit(1);
	}
	const objectStore: Record<string, boolean> = {};
	const duplicateExportPaths: string[] = [];

	for (const obj of entries) {
		const value = obj.exportPath;

		if (objectStore[value]) {
			duplicateExportPaths.push(`"${value}"`);
		} else {
			objectStore[value] = true;
		}
	}
	if (duplicateExportPaths.length > 0) {
		console.error(
			tcolor.magenta(
				`Duplicate export paths/path (${duplicateExportPaths.join(",")}) found in your susee.config file or build options , that will error for bundled output`,
			),
		);
		ts6.sys.exit(1);
	}

	for (const obj of entries) {
		if (!ts6.sys.fileExists(ts6.sys.resolvePath(obj.entry))) {
			console.error(tcolor.magenta(`Entry file ${obj.entry} dose not exists.`));
			ts6.sys.exit(1);
		}
	}
}

export type BuildEntryPoint = {
	entry: string;
	exportPath: "." | `./${string}`;
	format: OutputFormat;
	plugins: (SuseePlugin | SuseePluginFunction)[];
	outputDirectoryPath: string;
	warning: boolean;
	tsconfigFilePath: string | undefined;
	checks:CheckOptions;
};
export type BuildOptions = {
	buildEntryPoints: BuildEntryPoint[];
	updatePackage: boolean;
	outDir: string;
};

/**
 * Generates normalized build options from the user config.
 * It validates entry points, applies default values, removes duplicate formats,
 * resolves the output directory for each export path, and keeps duplicate declaration handling fail-fast.
 * @param {SuSeeConfig} config - raw susee configuration object.
 * @returns {BuildOptions} normalized build options for the compiler.
 */
function generateBuildOptions(config: SuSeeConfig): BuildOptions {
	const outDir = config.outDir ?? "dist";
	const points: BuildEntryPoint[] = [];
	checkEntries(config.entryPoints);
	for (const ent of config.entryPoints) {
		const entry = ent.entry;
		const exportPath = ent.exportPath;
		const format: OutputFormat = ent.format
			? [...new Set(ent.format)]
			: ["esm"];
		const warning = ent.warning ?? false;
		const plugins = ent.plugins ?? [];
		const tsconfigFilePath = ent.tsconfigFilePath ?? undefined;
		const outputDirectoryPath =
			ent.exportPath === "." ? outDir : `${outDir}${ent.exportPath.slice(1)}`;
		const checks:CheckOptions = {
           checkAnonymous: ent.checks?.checkAnonymous ?? false,
		   checkDefaultExports: ent.checks?.checkDefaultExports ?? false,
		   checkNpmInstalled: ent.checks?.checkNpmInstalled ?? false
		}
		points.push({
			entry,
			exportPath,
			format,
			plugins,
			warning,
			outputDirectoryPath,
			tsconfigFilePath,
			checks
		});
	}
	return {
		buildEntryPoints: points,
		updatePackage: config.allowUpdatePackageJson ?? false,
		outDir,
	} as BuildOptions;
}

/**
 * Loads the susee config file from the current working directory and converts it into build options.
 * If no supported config file is found, it returns `undefined`.
 * @returns {Promise<BuildOptions | undefined>} normalized build options or undefined when no config file exists.
 */
async function finalSuseeConfig(): Promise<BuildOptions | undefined> {
	const configPath = getSuseeConfigPath();
	if (configPath) {
		const _default: { default: SuSeeConfig } = await import(
			configPath as string
		);
		const config = _default.default;
		return generateBuildOptions(config);
	}
}

export { finalSuseeConfig, generateBuildOptions };
