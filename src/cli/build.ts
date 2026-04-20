import tcolor from "@suseejs/color";
import ts from "typescript";
import { Compiler } from "../lib/compiler.js";
import { type BuildOptions, finalSuseeConfig } from "../lib/suseeConfig.js";

async function cliBuild() {
	console.time(tcolor.cyan("[Build] "));
	const buildOptions = await finalSuseeConfig();
	if (!buildOptions) {
		console.error(
			tcolor.magenta(
				`No susee.config file ("susee.config.ts", "susee.config.js", "susee.config.mjs") found`,
			),
		);
		ts.sys.exit(1);
	}
	const compiler = new Compiler(buildOptions as BuildOptions);
	await compiler.compile();
	console.timeEnd(tcolor.cyan("[Build] "));
}

export { cliBuild };
