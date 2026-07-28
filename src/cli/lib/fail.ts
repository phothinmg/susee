import tcolor from "../../lib/tcolor.js";

export function fail(message: string) {
	console.error(`${tcolor.magenta("[Error]")} : ${tcolor.gray(message)}`);
	process.exit(1);
}
