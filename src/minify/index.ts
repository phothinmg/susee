import path from "node:path";
import { type MinifyOptions, minify as minify2 } from "terser";
import type { OutPutHook } from "../types";

/**
 * Minifies given code using Terser.
 * @param {MinifyOptions} options Optional options for Terser.
 * @returns {OutPutHook} Hook for minifying.
 */
const minify = (options?: MinifyOptions): OutPutHook => {
	return {
		async: true,
		func: async (code, file) => {
			if (path.extname(file as string) === ".js") {
				code = (await minify2(code, options)).code as string;
			}
			return code;
		},
	};
};

export default minify;
