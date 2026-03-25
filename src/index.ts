import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import tcolor from "@suseejs/tcolor";
import ts from "typescript";
import { bundle } from "./lib/bundle/index.js";
import { Compiler } from "./lib/compile/index.js";
import {
	type InitializeResult,
	initializer,
} from "./lib/initialization/index.js";
import type { SuSeeConfig } from "./lib/initialization/suseeConfig.js";

const finalCheck = (initialized: InitializeResult) => {
	const points = initialized.points;
	for (const point of points) {
		for (const file of point.depFiles) {
			if (file.moduleType === "cjs" || file.fileExt === ".cjs") {
				console.error(
					`> ${tcolor.cyan(
						`Unsupported CommonJS dependency: ${tcolor.magenta(file.file)}\n  To resolve that, use @suseejs/plugin-commonjs`,
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
 * Main entry point for SuSee
 *
 * This function is the main entry point for the SuSee bundler.
 * It initializes the bundling process, resolves the dependency tree,
 * compiles the resolved dependencies, and writes the compiled output
 * to disk.
 *
 * @returns {Promise<void>} A promise that resolves when the bundling
 * process is complete.
 */
async function susee(): Promise<void> {
	console.time(`susee > ${tcolor.cyan(`Done in`)}`);
	console.time(
		`susee > ${tcolor.cyan(`Initialized ${tcolor.magenta(pkg_nv)}`)} `,
	);
	const initialized = await initializer();
	finalCheck(initialized);
	console.timeEnd(
		`susee > ${tcolor.cyan(`Initialized ${tcolor.magenta(pkg_nv)}`)} `,
	);
	const bundled = await bundle(initialized);
	const compiler = new Compiler(bundled);
	await compiler.compile();
	console.timeEnd(`susee > ${tcolor.cyan(`Done in`)}`);
}

export type { SuSeeConfig };
export { susee };
