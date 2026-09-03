import path from "node:path";
import fs from "node:fs";
import readline from "node:readline/promises";
import { logInfo } from "@suseejs/susee_bundler";

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
      // (optional) Custom tsconfig.json path, default: undefined.
      // Uncomment the following line to edit.
      //tsconfigFilePath: undefined,
      // (optional)Lint checks to run on the bundled output.
      // Uncomment the following line to edit.
      //checks:{ checkAnonymous: false, checkDefaultExports: false, checkNpmInstalled: false }.
      // (optional) Minify the bundled output.
      // Pass true for default minification, or an object with custom MinifyOptions.
      // Uncomment the following line to edit.
      //minify: false,
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
      // (optional) Custom tsconfig.json path, default: undefined.
      // Uncomment the following line to edit.
      //tsconfigFilePath: undefined,
      // (optional)Lint checks to run on the bundled output.
      // Uncomment the following line to edit.
      //checks:{ checkAnonymous: false, checkDefaultExports: false, checkNpmInstalled: false }.
      // (optional) Minify the bundled output.
      // Pass true for default minification, or an object with custom MinifyOptions.
      // Uncomment the following line to edit.
      //minify: false,
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
  const is_ts = await rl.question("Is TypeScript Project(y/n) : ");
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
  logInfo(`Done! Susee config file ${configFile} is created at project root.`);
}

export { cliInit };
