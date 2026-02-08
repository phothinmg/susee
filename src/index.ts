import initCollector from "./init/index.js";
import bundle from "./bundle/index.js";
import Compiler from "./compile/index.js";
import type { InitCollationsResult } from "./types_def.js";
import writePackage from "./package.js";
import utilities from "./utils.js";
import { astPluginParser } from "./plugin_parser.js";

async function susee() {
  const initObjects: InitCollationsResult[] = await initCollector();

  for (const object of initObjects) {
    let bundled = await bundle(object);
    // call ast plugins
    if (bundled.plugins.length) {
      for (let plugin of bundled.plugins) {
        plugin = typeof plugin === "function" ? plugin() : plugin;
        if (plugin.type === "ast") {
          bundled = astPluginParser(
            bundled,
            bundled.tsOptions.defaultCompilerOptions,
          )(plugin);
        }
      }
    }
    await utilities.wait(1000);
    const compiled = new Compiler(bundled);
    if (bundled.outputTarget === "nodejs") {
      if (bundled.outputFormat === "commonjs") {
        await compiled.commonjs();
      }
      if (bundled.outputFormat === "esm") {
        await compiled.esm();
      }
      if (bundled.outputFormat === "both") {
        await compiled.esm();
        await utilities.wait(1000);
        await compiled.commonjs();
      }
    } else {
      await compiled.esm();
    }
    if (bundled.allowUpdatePackageJson) {
      await writePackage(
        compiled.files,
        bundled.exportPath as "." | `./${string}`,
      );
    }
  }
}

export default susee;
