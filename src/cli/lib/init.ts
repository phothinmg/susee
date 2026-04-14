import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import tcolor from "../../lib/utils/tcolor.js";

// --------------------------------------------------------------------------------------//
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
    },
  ],
  // NOTE: the following options apply to all entry points.
  // ----------------------------------------------------------
  // (optional) Output directory, default: dist.
  // Uncomment the following line to edit.
  //outDir: "dist",
  // (optional) Array of susee plugins, default: [].
  // Uncomment the following line to edit.
  //plugins: [],
  // (optional) Allow susee to update your package.json, default: false.
  // Uncomment the following line to edit.
  //allowUpdatePackageJson: false,
};

export default config;
`.trim();
// --------------------------------------------------------------------------------------//
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
    },
  ],
  // NOTE: the following options apply to all entry points.
  // ----------------------------------------------------------
  // (optional) Output directory, default: dist.
  // Uncomment the following line to edit.
  //outDir: "dist",
  // (optional) Array of susee plugins, default: [].
  // Uncomment the following line to edit.
  //plugins: [],
  // (optional) Allow susee to update your package.json, default: false.
  // Uncomment the following line to edit.
  //allowUpdatePackageJson: false,
};

export default config;
`.trim();

async function getPackageType() {
	const pkgFile = "package.json";
	const pkgPath = path.resolve(process.cwd(), pkgFile);
	const _pkg = await fs.promises.readFile(pkgPath, "utf8");
	const pkg = JSON.parse(_pkg);
	let type = "commonjs";
	if (pkg.type && pkg.type === "module") type = "esm";
	return type;
}

export default async function init() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	const is_ts = await rl.question(tcolor.cyan("Is TypeScript project(y/n) : "));
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
	console.info(
		tcolor.cyan(`Susee config file ${configFile} is created at project root`),
	);
}
