import type { CollatedPoint, CollatedReturn } from "@suseejs/types";
import ts from "typescript";
import checks from "./checks.js";
import getConfig from "./config.js";
import generateDependencies from "./deps.js";
import getOptions from "./tsCompilerOptions.js";

/**
 * This function takes a susee configuration object and returns a promise that resolves with a `CollatedReturn` object.
 * The function iterates over the `points` array in the susee configuration object.
 * For each point, it generates the dependencies using the `generateDependencies` function.
 * It then checks if the dependencies are valid using the `checks.init` function.
 * If the dependencies are invalid, it exits the process with code 1.
 * If the dependencies are valid, it constructs a `CollatedPoint` object and adds it to the result array.
 * Finally, it returns a `CollatedReturn` object with the result array and the `allowUpdatePackageJson` flag.
 */
async function collections(): Promise<CollatedReturn> {
	const __config = await getConfig();
	const points = __config.points;
	const result: CollatedPoint[] = [];
	for (const point of points) {
		const __opts = getOptions(point);
		const __deps = await generateDependencies(point.entry, __config.plugins);

		const checked = await checks.init(__deps, __opts.esm);

		if (!checked) {
			ts.sys.exit(1);
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
			plugins: __config.plugins,
		} as CollatedPoint;
		result.push(c);
	}
	return {
		points: result,
		allowUpdatePackageJson: __config.allowUpdatePackageJson,
	} as CollatedReturn;
}

export default collections;
