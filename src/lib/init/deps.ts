import { Buffer } from "node:buffer";
import fs from "node:fs";
import dependencies from "@suseejs/dependencies";
import type { DepsFile, DepsFiles, SuseePlugins } from "@suseejs/types";
import utilities from "@suseejs/utils";
import ts from "typescript";

//---------------
async function fileSizes(path: string) {
  const s = await fs.promises.stat(path);
  const logical = s.size; // bytes in file
  const allocated = s.blocks !== null ? s.blocks * 512 : null; // bytes actually allocated (POSIX)
  return { logical, allocated };
}

const checkExport = (str: string, file: string) => {
  const esmRex = /export default .*/gm;
  const cjsRex = /export = .*/gm;
  const ctsRex = /.cts/g;
  if (str.match(esmRex) || (str.match(cjsRex) && file.match(ctsRex))) {
    return true;
  } else {
    return false;
  }
};

async function generateDependencies(
  entryFile: string,
  plugins: SuseePlugins,
): Promise<DepsFiles> {
  const deps = await dependencies(entryFile);
  const sorted = deps.sort(); // get dependencies graph
  let depsFiles: DepsFiles = [];

  await utilities.wait(1000);

  for (const dep of sorted) {
    const file = ts.sys.resolvePath(dep);
    const content = await fs.promises.readFile(file, "utf8");
    const s = await fileSizes(file);
    const length = content.length;
    const includeDefExport = checkExport(content, file);
    const _files = {
      file,
      content,
      length,
      includeDefExport,
      size: {
        logical: s.logical,
        allocated: s.allocated,
        utf8: new TextEncoder().encode(content).length,
        buffBytes: Buffer.byteLength(content, "utf8"),
      },
    } as DepsFile;
    depsFiles.push(_files);
  }
  // call dependency plugins
  if (plugins.length) {
    for (const plugin of plugins) {
      const _plug = typeof plugin === "function" ? plugin() : plugin;
      if (_plug.type === "dependency") {
        if (_plug.async) {
          depsFiles = await _plug.func(depsFiles);
        } else {
          depsFiles = _plug.func(depsFiles);
        }
        await utilities.wait(1000);
      }
    }
  }
  return depsFiles;
}

export default generateDependencies;
