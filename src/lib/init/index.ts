import type { CollatedPoint, CollatedReturn } from "@suseejs/types";
import ts from "typescript";
import checks from "./checks.js";
import getConfig from "./config.js";
import generateDependencies from "./deps.js";
import getOptions from "./tsCompilerOptions.js";

async function collections(): Promise<CollatedReturn> {
	const __config = await getConfig();
	const points = __config.points;
	const result: CollatedPoint[] = [];
	for (const point of points) {
		const __opts = getOptions(point);
		const __deps = await generateDependencies(point.entry);

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
