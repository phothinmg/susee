import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import tcolor from "@suseejs/tcolor";
import bundle from "./lib/bundle/index.js";
import Compiler from "./lib/compile/index.js";
import initializer from "./lib/initialization/index.js";
import type { SuSeeConfig } from "./lib/types.js";
import utils from "./lib/utils.js";

const packageContent = fs.readFileSync(
	path.resolve(process.cwd(), "package.json"),
	"utf8",
);
const pkg = JSON.parse(packageContent);
const name = pkg.name ?? "";
const version = pkg.version ?? "";
let pkg_nv = "";
if (name !== "" && version !== "") {
	pkg_nv = `${name}@${version}`;
} else if (name !== "" && version === "") {
	pkg_nv = `${name}`;
} else if (name === "" && version !== "") {
	pkg_nv = `the project@${version}`;
} else {
	pkg_nv = "the project";
}

/**
 * Main entry point for susee.
 * It will:
 *  1. Collect all entry points from the configuration.
 *  2. Bundle all the entry points.
 *  3. Compile the bundled code.
 * The function will return a promise that resolves when the compilation is done.
 */
async function susee(): Promise<void> {
	console.time(`${tcolor.cyan(`Done in`)}`);
	console.time(`${tcolor.cyan(`Initialized ${tcolor.magenta(pkg_nv)}`)} `);
	const initialized = await initializer();
	console.timeEnd(`${tcolor.cyan(`Initialized ${tcolor.magenta(pkg_nv)}`)} `);
	await utils.wait(300);
	const bundled = await bundle(initialized);
	await utils.wait(300);
	const compiler = new Compiler(bundled);
	await compiler.compile();
	console.timeEnd(`${tcolor.cyan(`Done in`)}`);
}

export type { SuSeeConfig };
export { susee };
