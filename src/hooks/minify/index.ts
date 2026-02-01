import type SuSee from "@suseejs/types";
import utils from "@suseejs/utils";
import { type MinifyOptions, minify as minify2 } from "terser";

/**
 * Minifies given code using Terser.
 * @param {MinifyOptions} options Optional options for Terser.
 * @returns {OutPutHook} Hook for minifying.
 */
const minify = (options?: MinifyOptions): SuSee.PostProcessHook => {
	return {
		async: true,
		func: async (code, file) => {
			if (utils.extname(file as string) === ".js") {
				code = (await minify2(code, options)).code as string;
			}
			return code;
		},
	};
};

export default minify;
