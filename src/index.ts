import tcolor from "./lib/utils/tcolor.js";
import { bundle } from "./lib/bundle/index.js";
import { Compiler } from "./lib/compile/index.js";
import { initializer } from "./lib/initialization/index.js";
import type { SuSeeConfig } from "./lib/initialization/suseeConfig.js";
import { finalCheck } from "./lib/utils/finalCheck.js";
import { packageJson } from "./lib/utils/package-json.js";

/**
 * Main entry point for SuSee
 *
 * This function is the main entry point for the SuSee bundler.
 * It initializes the bundling process, resolves the dependency tree,
 * compiles the resolved dependencies, and writes the compiled output
 * to disk.
 *
 * @returns {Promise<void>} A promise that resolves when the bundling
 * process is complete.
 */
export const susee = async (): Promise<void> => {
	console.time(`  ${tcolor.cyan(`Done`)} `);
	const pkg_nv = packageJson().pkgNameVersion();
	console.time(`> ${tcolor.cyan(`Initialized ${tcolor.magenta(pkg_nv)}`)} `);
	const initialized = await initializer();
	finalCheck(initialized);
	console.timeEnd(`> ${tcolor.cyan(`Initialized ${tcolor.magenta(pkg_nv)}`)} `);
	const bundled = await bundle(initialized);
	const compiler = new Compiler(bundled);
	await compiler.compile();
	console.timeEnd(`  ${tcolor.cyan(`Done`)} `);
};

export type { SuSeeConfig };
