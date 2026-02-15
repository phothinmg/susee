import tcolor from "@suseejs/tcolor";
import type { CollatedPoint, CollatedReturn } from "@suseejs/types";
import ts from "typescript";
import checks from "./checks.js";
import getConfig from "./config.js";
import generateDependencies from "./deps.js";
import getOptions from "./tsCompilerOptions.js";

/**
 * This function is the main entry point for susee.
 */
async function collections(): Promise<CollatedReturn> {
	console.time(`${tcolor.cyan("Collected Data")}`);
	const __config = await getConfig();
	const points = __config.points;
	const plugins = __config.plugins;
	const result: CollatedPoint[] = [];
	for (const point of points) {
		const __opts = getOptions(point);
		const __deps = await generateDependencies(point.entry);
		const typeChecked = await checks.types(__deps, __opts.esm);
		if (!typeChecked) {
			ts.sys.exit(1);
		}
		let isParseCommonjs = false;
		if (plugins.length) {
			for (const plugin of plugins) {
				const _plugin = typeof plugin === "function" ? plugin() : plugin;
				if (_plugin.type === "dependency") {
					if (_plugin.name && _plugin.name === "@suseejs/plugin-commonjs") {
						isParseCommonjs = true;
					}
				}
			}
		}

		if (!isParseCommonjs) {
			const checked = await checks.moduleAndExtension(__deps);
			if (!checked) {
				ts.sys.exit(1);
			}
		}

		const c = {
			fileName: point.entry,
			exportPath: point.exportPath,
			format: point.format,
			rename: point.renameDuplicates,
			outDir: point.outDir,
			tsOptions: {
				cjs: __opts.commonjs,
				esm: __opts.esm,
				default: __opts.default,
			},
			depFiles: __deps,
			plugins: plugins,
		} as CollatedPoint;
		result.push(c);
	}
	console.timeEnd(`${tcolor.cyan("Collected Data")}`);
	return {
		points: result,
		allowUpdatePackageJson: __config.allowUpdatePackageJson,
	} as CollatedReturn;
}

export default collections;
