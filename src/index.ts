import fs from "node:fs";
import { wait, getEntryPath, clearFolder } from "./helpers";
import bundle from "./bundle";
import { type OutPutHook, type Target } from "./types";
import writePackage from "./package";
import Compilers from "./compilers";

namespace susee {
  export type PostProcessHook = OutPutHook;
  export interface BuildOptions {
    entry: string;
    target?: Target;
    defaultExportName?: string | undefined;
    outDir?: string;
    isMainExport?: boolean;
    replaceWithBlank?: string[];
    hooks?: PostProcessHook[];
  }
  export async function build({
    entry,
    target = "both",
    defaultExportName = undefined,
    outDir = "dist",
    isMainExport = true,
    replaceWithBlank = [],
    hooks = []
  }: BuildOptions) {
    console.time("Build Time");
    if (fs.existsSync(outDir)) {
      await clearFolder(outDir);
    }
    entry = getEntryPath(entry);
    let doubleExport = false;
    const complier = new Compilers();
    if (target === "commonjs") {
      const bun = await bundle(entry, false);
      await complier.commonjs(
        bun.code,
        entry,
        outDir,
        isMainExport,
        defaultExportName,
        replaceWithBlank,
        hooks
      );
      doubleExport = bun.dexport;
    } else if (target === "esm") {
      const bun2 = await bundle(entry, true);
      await complier.esm(bun2.code, entry, outDir, isMainExport, hooks);
    } else if (target === "both") {
      const bun = await bundle(entry, false);
      await complier.commonjs(
        bun.code,
        entry,
        outDir,
        isMainExport,
        defaultExportName,
        replaceWithBlank,
        hooks
      );
      doubleExport = bun.dexport;
      await wait(1000);
      const bun2 = await bundle(entry, true);
      await complier.esm(bun2.code, entry, outDir, isMainExport, hooks);
    }
    await wait(1000);
    await writePackage(complier.files, isMainExport, outDir);
    if (doubleExport) {
      console.warn(
        "Found both `Name Export` and `Default Export` at entry,that will lose `Name Export` in commonjs output. ",
      );
    }
    console.timeEnd("Build Time");
  }
}

export default susee;
