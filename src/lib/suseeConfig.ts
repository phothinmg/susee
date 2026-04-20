import tcolor from "@suseejs/color";
import type { SuseePlugin, SuseePluginFunction } from "@suseejs/type";
import ts from "typescript";

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
	 */
	tsconfigFilePath?: string | undefined;
	/**
	 * When bundling , if there are duplicate declared names , susee will auto rename , if renameDuplicates = false exist with code 1.
	 *
	 * default - true
	 */
	renameDuplicates?: boolean;
	/**
	 * Array of susee plugins
	 *
	 * default - []
	 */
	plugins?: (SuseePlugin | SuseePluginFunction)[];
	warning?: boolean;
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
const getConfigPath = (): string | undefined => {
	const fileNames = ["susee.config.ts", "susee.config.js", "susee.config.mjs"];
	let configFile: string | undefined;
	for (const file of fileNames) {
		const _file = ts.sys.resolvePath(file);
		if (ts.sys.fileExists(_file)) {
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
		ts.sys.exit(1);
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
		ts.sys.exit(1);
	}

	for (const obj of entries) {
		if (!ts.sys.fileExists(ts.sys.resolvePath(obj.entry))) {
			console.error(tcolor.magenta(`Entry file ${obj.entry} dose not exists.`));
			ts.sys.exit(1);
		}
	}
}

export type BuildEntryPoint = {
	entry: string;
	exportPath: "." | `./${string}`;
	format: OutputFormat;
	tsconfigFilePath: string | undefined;
	rename: boolean;
	plugins: (SuseePlugin | SuseePluginFunction)[];
	outputDirectoryPath: string;
	warning: boolean;
};
export type BuildOptions = {
	buildEntryPoints: BuildEntryPoint[];
	updatePackage: boolean;
	outDir: string;
};

function generateBuildOptions(config: SuSeeConfig) {
	const outDir = config.outDir ?? "dist";
	const points: BuildEntryPoint[] = [];
	checkEntries(config.entryPoints);
	for (const ent of config.entryPoints) {
		const entry = ent.entry;
		const exportPath = ent.exportPath;
		const tsconfigFilePath = ent.tsconfigFilePath ?? undefined;
		const format: OutputFormat = ent.format
			? [...new Set(ent.format)]
			: ["esm"];
		const warning = ent.warning ?? false;
		const rename = ent.renameDuplicates ?? true;
		const plugins = ent.plugins ?? [];
		const outputDirectoryPath =
			ent.exportPath === "." ? outDir : `${outDir}${ent.exportPath.slice(1)}`;
		points.push({
			entry,
			exportPath,
			format,
			tsconfigFilePath,
			rename,
			plugins,
			warning,
			outputDirectoryPath,
		});
	}
	return {
		buildEntryPoints: points,
		updatePackage: config.allowUpdatePackageJson ?? false,
		outDir,
	} as BuildOptions;
}

async function finalSuseeConfig(): Promise<BuildOptions | undefined> {
	const configPath = getConfigPath();
	if (configPath) {
		const _default: { default: SuSeeConfig } = await import(
			configPath as string
		);
		const config = _default.default;
		return generateBuildOptions(config);
	}
}

export { finalSuseeConfig, generateBuildOptions };
