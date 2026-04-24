import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import tcolor from "@suseejs/color";
import pkg from "../../package.json" with { type: "json" };
import { cliBuild } from "./build.js";
import { cliCompiler } from "./cli.js";
import { getDefaultOptions, parseArgs } from "./lib/parse_argv.js";
import { printHelp } from "./lib/print_help.js";

const tsFileText = `
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  // Array of entry point objects.
  // ----------------------------
  entryPoints: [
    // You can add more entry points for different export paths.
    // NOTE: duplicate export paths are not allowed.
    // --------------------------------------------
    {
      // (required) Entry file path.
      entry: "src/index.ts", // replace with your entry file
      // (required) Export path for this entry.
      exportPath: ".", // "." stands for the main export path and can be set to "./foo", "./bar", etc.
      // (optional) Output module formats ["commonjs"] or ["esm", "commonjs"], default: ["esm"].
      // Uncomment the following line to edit.
      //format: ["esm"],
      // (optional) Rename duplicate declarations, default: true.
      // Uncomment the following line to edit.
      //renameDuplicates: true,
      // (optional) Custom tsconfig.json path, default: undefined.
      // Uncomment the following line to edit.
      //tsconfigFilePath: undefined,
      // (optional) Array of susee plugins, default: [].
      // Uncomment the following line to edit.
      //plugins: [],
      // (optional) Warning messages, if it true and warning message exist(1), default: false.
      // Uncomment the following line to edit.
      //warning: false,
    },
  ],
  // NOTE: the following options apply to all entry points.
  // ----------------------------------------------------------
  // (optional) Output directory, default: dist.
  // Uncomment the following line to edit.
  //outDir: "dist",
  // (optional) Allow susee to update your package.json, default: false.
  // Uncomment the following line to edit.
  //allowUpdatePackageJson: false,
};

export default config;
`.trim();

const jsFileText = `
/**
 * @type {import("susee").SuSeeConfig}
 */
const config = {
  // Array of entry point objects.
  // ----------------------------
  entryPoints: [
    // You can add more entry points for different export paths.
    // NOTE: duplicate export paths are not allowed.
    // --------------------------------------------
    {
      // (required) Entry file path.
      entry: "src/index.ts", // replace with your entry file
      // (required) Export path for this entry.
      exportPath: ".", // "." stands for the main export path and can be set to "./foo", "./bar", etc.
      // (optional) Output module formats ["commonjs"] or ["esm", "commonjs"], default: ["esm"].
      // Uncomment the following line to edit.
      //format: ["esm"],
      // (optional) Rename duplicate declarations, default: true.
      // Uncomment the following line to edit.
      //renameDuplicates: true,
      // (optional) Custom tsconfig.json path, default: undefined.
      // Uncomment the following line to edit.
      //tsconfigFilePath: undefined,
      // (optional) Array of susee plugins, default: [].
      // Uncomment the following line to edit.
      //plugins: [],
      // (optional) Warning messages, if it true and warning message exist(1), default: false.
      // Uncomment the following line to edit.
      //warning: false,
    },
  ],
  // NOTE: the following options apply to all entry points.
  // ----------------------------------------------------------
  // (optional) Output directory, default: dist.
  // Uncomment the following line to edit.
  //outDir: "dist",
  // (optional) Allow susee to update your package.json, default: false.
  // Uncomment the following line to edit.
  //allowUpdatePackageJson: false,
};

export default config;
`.trim();

async function getPackageType() {
	const pkgPath = path.resolve(process.cwd(), "package.json");
	const _pkg = await fs.promises.readFile(pkgPath, "utf8");
	const pkg = JSON.parse(_pkg);
	return pkg.type === "module" ? "esm" : "commonjs";
}

async function cliInit() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	console.log(`${tcolor.gray("┌")} ${tcolor.green("Welcome to Susee!")}`);
	console.log("");
	console.log(`${tcolor.gray("│")}`);
	const is_ts = await rl.question(
		`${tcolor.cyan("◇")} Is TypeScript Project(y/n) : `,
	);
	const isTs = !!(is_ts === "y" || is_ts === "Y" || is_ts === "");
	rl.close();
	let configFile = "";
	let str = "";
	if (isTs) {
		configFile = "susee.config.ts";
		str = tsFileText;
	} else {
		str = jsFileText;
		const pkgType = await getPackageType();
		switch (pkgType) {
			case "commonjs":
				configFile = "susee.config.mjs";
				break;
			case "esm":
				configFile = "susee.config.js";
				break;
		}
	}
	const configFilePath = path.resolve(process.cwd(), configFile);
	if (fs.existsSync(configFilePath)) await fs.promises.unlink(configFilePath);
	await fs.promises.writeFile(configFilePath, str);
	console.log("");
	console.log(`${tcolor.gray("│")}`);
	console.log("");
	console.info(
		`${tcolor.gray("└")} Done! Susee config file ${tcolor.cyan(configFile)} is created at project root`,
	);
}

async function suseeCliBuild() {
	const args = process.argv.slice(2);
	if (args.length === 0) {
		await cliBuild();
	} else if (args.length === 1) {
		if (args[0] === "--version" || args[0] === "-v") {
			console.log(tcolor.cyan(`susee v${pkg.version}`));
		}
		if (args[0] === "--help" || args[0] === "-h") {
			printHelp();
		}
		if (args[0] === "init") {
			await cliInit();
		}
		if (args[0] === "build") {
			printHelp();
		}
	} else if (
		args.length > 1 &&
		args[0] === "build" &&
		(args[1] === "--help" || args[1] === "-h")
	) {
		printHelp();
	} else if (args.length > 1 && args[0] === "build") {
		const _r = parseArgs(args.slice(1));
		const options = getDefaultOptions(_r);
		await cliCompiler.compile(options);
	} else {
		console.error("Unknown CLI usage");
		process.exit(1);
	}
}

void suseeCliBuild().catch((error) => {
	console.error(error);
	process.exit(1);
});
