import tcolor from "./tcolor.js";
import ts from "typescript";
import type { InitializeResult } from "../initialization/index.js";

/**
 * Final check for unsupported dependencies.
 * Currently, it checks for CommonJS dependencies and JSX/TSX dependencies.
 * If any unsupported dependencies are found, it will print an error message and exit with code 1.
 * @param initialized - The result of the initializer function.
 */
export const finalCheck = (initialized: InitializeResult) => {
	const points = initialized.points;
	for (const point of points) {
		for (const file of point.depFiles) {
			if (file.moduleType === "cjs" || file.fileExt === ".cjs") {
				console.error(
					`> ${tcolor.cyan(
						`Unsupported CommonJS dependency: ${tcolor.magenta(file.file)}\n  To resolve that, recommend to use susee-plugin-commonjs`,
					)}`,
				);
				ts.sys.exit(1);
			} else if (
				file.isJsx ||
				file.fileExt === ".jsx" ||
				file.fileExt === ".tsx"
			) {
				console.error(
					`> ${tcolor.cyan(
						`Unsupported JSX/TSX dependency: ${tcolor.magenta(file.file)}\n  That will be fix in future versions`,
					)}`,
				);
				ts.sys.exit(1);
			}
		} //
	}
};
