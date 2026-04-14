import tcolor from "../../lib/utils/tcolor.js";

export function fail(message: string) {
	console.error(`${tcolor.magenta("FAIL")} : ${tcolor.gray(message)}`);
	process.exit(1);
}
