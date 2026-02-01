import Compilers from "./compiler/index.js";
import bundle from "@suseejs/bundler";
import utils from "@suseejs/utils";
import type SuSee from "@suseejs/types";
import writePackage from "./package.js";
import bundler from "./bundler/index.js";

export const aa = "aa";
namespace susee {
  export type Options = {
    entry: string;
    exportPath: "." | `./${string}`;
    target?: SuSee.Target;
    hooks?: SuSee.PostProcessHook[];
    configPath?: string | undefined;
    allowUpdatePackageJson?: boolean;
  };
  export async function build({
    entry,
    exportPath,
    target = "both",
    hooks = [],
    configPath = undefined,
    allowUpdatePackageJson = true,
  }: Options): Promise<void> {
    console.time("Build Time");
    // if (utils.directoryExists(utils.resolvePath(outDir))) {
    //   utils.cleanDirectory(utils.resolvePath(outDir));
    // }
    const bundled = await bundle(entry);
    const sourceCode = bundled.content;

    const compiler = new Compilers({ target, configPath });
    if (target === "commonjs") {
      await compiler.commonjs(
        sourceCode,
        entry,
        exportPath,
        hooks,
        allowUpdatePackageJson,
      );
    } else if (target === "esm") {
      await compiler.esm(
        sourceCode,
        entry,
        exportPath,
        hooks,
        allowUpdatePackageJson,
      );
    } else if (target === "both") {
      await compiler.commonjs(
        sourceCode,
        entry,
        exportPath,
        hooks,
        allowUpdatePackageJson,
      );
      await utils.wait(1000);
      await compiler.esm(
        sourceCode,
        entry,
        exportPath,
        hooks,
        allowUpdatePackageJson,
      );
    }
    await utils.wait(1000);
    // if (allowUpdatePackageJson) {
    //   await writePackage(compiler.files, isMainExport, outDir);
    // }

    console.timeEnd("Build Time");
  }
}

export default susee;
