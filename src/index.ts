import tcolor from "@suseejs/color";
import { Compiler } from "./lib/compiler.js";
import {
	type BuildOptions,
	finalSuseeConfig,
	generateBuildOptions,
	type SuSeeConfig,
} from "./lib/suseeConfig.js";

/**
 * Run a Susee build.
 *
 * Resolution order:
 * 1. Use `options` when provided.
 * 2. Otherwise try loading root config via `finalSuseeConfig()`.
 *
 * If neither source is available, this logs an error and exits with code 1.
 */
async function build(options?: SuSeeConfig) {
	console.time(tcolor.cyan("[Build] "));
	let buildOptions = {} as BuildOptions;
	const _buildOptions = await finalSuseeConfig();
	if (!options && !_buildOptions) {
		console.error(
			`${tcolor.magenta("[Error]")} : Required build options or susee config file at root.\n          Use ${tcolor.bold("npx susee init")} to create config file.`,
		);
		process.exit(1);
	}
	if (options) {
		buildOptions = generateBuildOptions(options);
	} else if (_buildOptions) {
		buildOptions = _buildOptions;
	}
	const compiler = new Compiler(buildOptions);
	await compiler.compile();
	console.timeEnd(tcolor.cyan("[Build] "));
}

export type { SuSeeConfig };
export { build };
