import fs from "node:fs";
import path from "node:path";

export default async function init() {
	const configFile = "susee.config.ts";
	const configFilePath = path.resolve(process.cwd(), configFile);
	const fileText = String.raw`
  import type { SuSeeConfig } from "susee";

export default {
  // array of entryPoint objects.
  // ----------------------------
  entryPoints: [
    // you can add more entryPoints for different exportPaths
    // NOTE : duplicate export paths are not allow.
    // --------------------------------------------
    {
      // (required) entry file path
      entry: "src/index.ts", // replace with your entry file
      // (required) export path of this entry
      exportPath: ".", // "." stand for main export path , can be set like "./foo","./bar"
      // (optional) output module formats ["commonjs"] or ["esm","commonjs"] , default : ["esm"].
      // Uncomment the following line to edit.
      //format: ["esm"],
      // (optional) replace duplicated declaration  , default : true.
      // Uncomment the following line to edit.
      //renameDuplicates: true,
      // (optional) custom tsconfig.json path  , default : undefined.
      // Uncomment the following line to edit.
      //tsconfigFilePath: undefined,
    },
  ],
  // NOTE : the following options are effect on all entryPoints
  // ----------------------------------------------------------
  // (optional) out directory  , default : dist.
  // Uncomment the following line to edit.
  //outDir: "dist",
  // (optional) array of susee plugins  , default : [].
  // Uncomment the following line to edit.
  //plugins: [],
  // (optional) allow susee to update your package.json  , default : false.
  // Uncomment the following line to edit.
  //allowUpdatePackageJson: false,
} as SuSeeConfig;
  `.trim();
	if (fs.existsSync(configFilePath)) {
		await fs.promises.unlink(configFilePath);
	}
	await fs.promises.writeFile(configFilePath, fileText);
	console.info(`Susee config file is created at ${configFilePath}.`);
}
