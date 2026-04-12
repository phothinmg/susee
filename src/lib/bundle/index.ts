import path from "node:path";
import tcolor from "susee-tcolor";
import type {
  BundledResult,
  BundlePoint,
  InitializePoint,
  InitializeResult,
  SuseePlugin,
  SuseePluginFunction,
} from "susee-types";
import { duplicateHandlers } from "./handlers/duplicate.js";
import { anonymousHandler } from "./handlers/anonymous.js";
import { removeHandlers } from "./handlers/removes.js";
import { mergeImportsStatement } from "./mergeImports.js";
import clearUnusedCode from "./unusedCode.js";
import { exportDefaultHandler } from "./handlers/exportDefault.js";

// ------------------------------------------------------------------------------------//

/**
 * Applies an array of pre-process plugins to the given code.
 * Pre-process plugins are of type "pre-process" and transform the given code.
 * The plugins are applied in order and the result of the previous plugin is given as input to the next plugin.
 * @param plugins - An array of plugins to apply.
 * @param code - The code to transform.
 * @param file - An optional file name to pass to the plugins.
 * @returns The transformed code.
 */
async function preProcessPluginParser(
  plugins: (SuseePlugin | SuseePluginFunction)[],
  code: string,
  file?: string | undefined,
) {
  if (plugins.length) {
    for (const plugin of plugins) {
      const _plugin = typeof plugin === "function" ? plugin() : plugin;
      if (_plugin.type === "pre-process") {
        if (_plugin.async) {
          code = await _plugin.func(code, file);
        } else {
          code = _plugin.func(code, file);
        }
      }
    }
  }
  return code;
}

// ----------------------------------------------------------------------------------

async function bundler(point: InitializePoint): Promise<BundlePoint> {
  console.time(
    `  > ${tcolor.cyan(`Bundled`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
  );
  let depsFiles = point.depFiles;
  const reName = point.rename;
  const compilerOptions = point.tsOptions.default;
  const plugins = point.plugins;
  let removedStatements: string[] = [];

  depsFiles = await exportDefaultHandler(depsFiles, compilerOptions);

  // Handling anonymous imports/exports
  depsFiles = await anonymousHandler(depsFiles, compilerOptions);
  // duplicates
  if (reName) {
    depsFiles = await duplicateHandlers.renamed(depsFiles, compilerOptions);
  } else {
    depsFiles = await duplicateHandlers.notRenamed(depsFiles, compilerOptions);
  }

  // Remove Imports
  const removed = await removeHandlers(removedStatements, compilerOptions);
  depsFiles = depsFiles.map(removed[0]);
  // Remove Exports from dependencies only
  // not remove exports from entry file
  const deps_files = depsFiles.slice(0, -1).map(removed[1]);
  const mainFile = depsFiles.slice(-1);
  // Handle imported statements
  // filter removed statements , that not from local like `./` or `../`
  const regexp = /["']((?!\.\/|\.\.\/)[^"']+)["']/;
  removedStatements = removedStatements.filter((i) => regexp.test(i));
  removedStatements = mergeImportsStatement(removedStatements);
  // Create final content
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
  // text join order is important here
  let content = `${importStatements}\n${depFilesContent}\n${mainFileContent}`;
  // remove ;
  content = content.replace(/^s*;\s*$/gm, "").trim();
  content = clearUnusedCode(content, point.fileName, compilerOptions);

  // Call pre-process plugins
  content = await preProcessPluginParser(plugins, content);
  // Returns
  console.timeEnd(
    `  > ${tcolor.cyan(`Bundled`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
  );
  return { bundledContent: content, ...point } as BundlePoint;
}

async function bundle(object: InitializeResult) {
  const points: BundlePoint[] = [];
  for (const point of object.points) {
    const _point = await bundler(point);
    points.push(_point);
  }
  return {
    points,
    allowUpdatePackageJson: object.allowUpdatePackageJson,
  } as BundledResult;
}

export { bundle };
