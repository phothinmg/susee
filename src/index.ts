import type { SuSeeConfig, SuseePlugin } from "@suseejs/types";
import utilities from "@suseejs/utils";
import bundle from "./lib/bundle/index.js";
import Compiler from "./lib/compile/index.js";
import collections from "./lib/init/index.js";

async function susee() {
	const collected = await collections();
	await utilities.wait(1000);
	const bundled = await bundle(collected);
	await utilities.wait(1000);
	const compiler = new Compiler(bundled);
	await compiler.compile();
}

export type { SuSeeConfig, SuseePlugin };
export { susee };
