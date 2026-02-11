import path from "node:path";
import type {
  BundledResult,
  BundleResultPoint,
  CollatedPoint,
  CollatedReturn,
} from "@suseejs/types";
import utilities from "@suseejs/utils";
import tcolor from "@suseejs/tcolor";
import mergeImportsStatement from "./mergeImports.js";
import anonymous from "./anonymous.js";
import duplicateHandlers from "./duplicates.js";
import removeHandlers from "./removes.js";
import { splitCamelCase } from "../helpers.js";
import clearUnusedCode from "./unusedCode.js";
// ------------------------------------------------------------------------------------//

async function bundler(point: CollatedPoint): Promise<BundleResultPoint> {
  const _name =
    point.exportPath === "."
      ? "Main"
      : splitCamelCase(point.exportPath.slice(2));
  console.time(
    `${tcolor.cyan(`Bundled`)} -> ${tcolor.brightCyan(_name)} ${tcolor.cyan(`export path`)}`,
  );
  let depsFiles = point.depFiles;
  const reName = point.rename;
  const compilerOptions = point.tsOptions.default;
  const plugins = point.plugins;
  let removedStatements: string[] = [];
  // 1. Call dependency plugins
  if (plugins.length) {
    for (let plugin of plugins) {
      plugin = typeof plugin === "function" ? plugin() : plugin;
      if (plugin.type === "dependency") {
        if (plugin.async) {
          depsFiles = await plugin.func(depsFiles);
        } else {
          depsFiles = plugin.func(depsFiles);
        }
      }
    }
  } //--
  //await utilities.wait(1000);
  // 2. Handle duplicates
  if (reName) {
    depsFiles = await duplicateHandlers.renamed(depsFiles, compilerOptions);
  } else {
    depsFiles = await duplicateHandlers.notRenamed(depsFiles, compilerOptions);
  }
  // 3. Handling anonymous imports and exports
  depsFiles = await anonymous(depsFiles, compilerOptions);
  //await utilities.wait(1000);
  // 4. Remove Imports
  const removed = await removeHandlers(removedStatements, compilerOptions);
  depsFiles = depsFiles.map(removed[0]);
  //await utilities.wait(500);
  // 5. Remove Exports from dependencies only
  // not remove exports from entry file
  const deps_files = depsFiles.slice(0, -1).map(removed[1]);
  const mainFile = depsFiles.slice(-1);
  // 6. Handle imported statements
  // filter removed statements , that not from local like `./` or `../`
  const regexp = /["']((?!\.\/|\.\.\/)[^"']+)["']/;
  removedStatements = removedStatements.filter((i) => regexp.test(i));
  removedStatements = mergeImportsStatement(removedStatements);
  // 7. Create final content
  // make sure all imports are at the top of file
  const importStatements = removedStatements.join("\n").trim();
  const depFilesContent = deps_files
    .map((i) => {
      const file = `//${path.relative(process.cwd(), i.file)}`;
      return `${file}\n${i.content}`;
    })
    .join("\n")
    .trim();
  const mainFileContent = mainFile
    .map((i) => {
      const file = `//${path.relative(process.cwd(), i.file)}`;
      return `${file}\n${i.content}`;
    })
    .join("\n")
    .trim();
  //await utilities.wait(1000);
  // text join order is important here
  let content = `${importStatements}\n${depFilesContent}\n${mainFileContent}`;
  // remove ;
  content = content.replace(/^s*;\s*$/gm, "").trim();
  content = clearUnusedCode(content, point.fileName, compilerOptions);
  // 8. Call pre-process plugins
  if (plugins.length) {
    for (let plugin of plugins) {
      plugin = typeof plugin === "function" ? plugin() : plugin;
      if (plugin.type === "pre-process") {
        if (plugin.async) {
          content = await plugin.func(content);
        } else {
          content = plugin.func(content);
        }
      }
    }
  } //--
  // 9. Returns
  console.timeEnd(
    `${tcolor.cyan(`Bundled`)} -> ${tcolor.brightCyan(_name)} ${tcolor.cyan(`export path`)}`,
  );
  return { bundledContent: content, ...point } as BundleResultPoint;
}

async function bundle(object: CollatedReturn) {
  const points: BundleResultPoint[] = [];
  for (const point of object.points) {
    const _point = await bundler(point);
    points.push(_point);
  }
  return {
    points,
    allowUpdatePackageJson: object.allowUpdatePackageJson,
  } as BundledResult;
}

export default bundle;
