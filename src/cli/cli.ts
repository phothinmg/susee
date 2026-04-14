import { bundle } from "../lib/bundle/index.js";
import { Compiler } from "../lib/compile/index.js";
import { cliInit } from "../lib/initialization/index.js";
import { finalCheck } from "../lib/utils/finalCheck.js";
import { packageJson } from "../lib/utils/package-json.js";
import tcolor from "../lib/utils/tcolor.js";

export const suseeCli = async (
	_entry: string,
	_format?: "commonjs" | "esm",
	outDir?: string,
	tsconfig?: string,
	rename?: boolean,
	allowUpdate?: boolean,
	minify?: boolean,
) => {
	console.time(`  ${tcolor.cyan(`Done`)} `);
	const pkg_nv = packageJson().pkgNameVersion();
	console.time(`> ${tcolor.cyan(`Initialized ${tcolor.magenta(pkg_nv)}`)} `);
	const initialized = await cliInit(
		_entry,
		_format,
		outDir,
		tsconfig,
		rename,
		allowUpdate,
		minify,
	);
	finalCheck(initialized);
	console.timeEnd(`> ${tcolor.cyan(`Initialized ${tcolor.magenta(pkg_nv)}`)} `);
	const bundled = await bundle(initialized);
	const compiler = new Compiler(bundled);
	await compiler.compile();
	console.timeEnd(`  ${tcolor.cyan(`Done`)} `);
};
