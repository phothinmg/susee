import ts6 from "@typescript/typescript6";
import { Compiler } from "../lib/compiler.js";
import { type BuildOptions, finalSuseeConfig } from "../lib/suseeConfig.js";
import tcolor from "../lib/tcolor.js";

async function cliBuild() {
	console.time(tcolor.cyan("[Build] "));
	const buildOptions = await finalSuseeConfig();
	if (!buildOptions) {
		console.error(
			tcolor.magenta(
				`No susee.config file ("susee.config.ts", "susee.config.js", "susee.config.mjs") found`,
			),
		);
		ts6.sys.exit(1);
	}
	const compiler = new Compiler(buildOptions as BuildOptions);
	await compiler.compile();
	console.timeEnd(tcolor.cyan("[Build] "));
}

export { cliBuild };
