import path from "node:path";
import type { OutPutHook } from "../types";

/**
 * Given a string, returns a banner text string.
 * The string is used as a part of the file name.
 * The file name is used as a part of the variable name.
 * The variable name is used as a part of the function name.
 * The function name is used as a part of the typescript OutPutHook.
 *
 * The OutPutHook is used to generate banner text strings.
 * The banner text string is used as a part of the typescript OutPutHook.
 *
 * @param {string} str - The input string.
 * @returns {OutPutHook} - The output banner text string.
 */
const bannerText = (str: string): OutPutHook => {
	return {
		async: false,
		func: (code, file) => {
			if (path.extname(file as string) === ".js") {
				code = `${str}\n${code}`;
			}
			return code;
		},
	};
};

export default bannerText;
