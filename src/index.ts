import tcolor from "@suseejs/tcolor";
import type { SuSeeConfig } from "@suseejs/types";
import utilities from "@suseejs/utils";
import bundle from "./lib/bundle/index.js";
import Compiler from "./lib/compile/index.js";
import collections from "./lib/init/index.js";

/**
 * Main entry point for susee.
 * It will:
 *  1. Collect all entry points from the configuration.
 *  2. Bundle all the entry points.
 *  3. Compile the bundled code.
 * The function will return a promise that resolves when the compilation is done.
 */
async function susee(): Promise<void> {
	console.info(`${tcolor.cyan(`Susee Started`)} : `);
	console.time(`${tcolor.cyan(`Susee Done`)}`);
	const collected = await collections();
	await utilities.wait(1000);
	const bundled = await bundle(collected);
	await utilities.wait(1000);
	const compiler = new Compiler(bundled);
	await compiler.compile();
	console.timeEnd(`${tcolor.cyan(`Susee Done`)}`);
}

export type { SuSeeConfig };
export { susee };
