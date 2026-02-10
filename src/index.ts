import tcolor from "@suseejs/tcolor";
import type { SuSeeConfig, SuseePlugin } from "@suseejs/types";
import utilities from "@suseejs/utils";
import bundle from "./lib/bundle/index.js";
import Compiler from "./lib/compile/index.js";
import collections from "./lib/init/index.js";

/**
 * Bundles a TypeScript project into a single file.
 * The function takes a {@link SuSeeConfig} object as input and returns a promise resolves with a bundled result.
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
 */
async function susee(): Promise<void> {
	console.info(`${tcolor.green("Start")} : ${tcolor.cyan("bundling")}`);
	const collected = await collections();
	await utilities.wait(1000);
	const bundled = await bundle(collected);
	await utilities.wait(1000);
	const compiler = new Compiler(bundled);
	await compiler.compile();
	console.info(`${tcolor.green("End")} : ${tcolor.cyan("bundling")}`);
}

export type { SuSeeConfig, SuseePlugin };
export { susee };
