import path from "node:path";
import tcolor from "@suseejs/tcolor";
import transformFunction from "@suseejs/transformer";
import type { DependenciesFiles } from "@suseejs/types";
import ts from "typescript";
import InternalHooks from "../hooks/index.js";
import type {
  InitializedPoint,
  InitializedResult,
} from "../initialization/index.js";
import utils from "../utils.js";
import mergeImportsStatement from "./mergeImports.js";
import removeHandlers from "./removes.js";

// ------------------------------------------------------------------------------------//

export interface BundledPoint {
  entryFileName: string;
  sourceCode: string;
  tsOptions: InitializedPoint["tsOptions"];
  exportPath: InitializedPoint["exportPath"];
  format: InitializedPoint["format"];
  plugins: InitializedPoint["plugins"];
  outDir: InitializedPoint["outDir"];
}
export interface BundledResult {
  points: BundledPoint[];
  allowUpdatePackageJson: boolean;
}
// ----------------------------------------------------------------------------------
const astTransformer = (
  content: string,
  file: string,
  compilerOptions: ts.CompilerOptions,
  func: (node: ts.Node, factory: ts.NodeFactory, file: string) => ts.Node,
): string => {
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const { factory } = context;
    const visitor = (node: ts.Node): ts.Node => {
      node = func(node, factory, file);
      return ts.visitEachChild(node, visitor, context);
    };
    return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
  };
  return transformFunction(transformer, sourceFile, compilerOptions);
};
// -----------------------------------------------------------------------------

async function bundler(point: InitializedPoint): Promise<BundledPoint> {
  console.time(
    `> ${tcolor.cyan(`Bundled`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
  );
  let depsFiles = point.depFiles;
  const compilerOptions = point.tsOptions.default;
  const plugins = point.plugins;
  let removedStatements: string[] = [];

  // Handling anonymous imports and exports
  //depsFiles = await anonymousHandler(depsFiles, compilerOptions);

  // Remove Imports
  const removed = await removeHandlers(removedStatements, compilerOptions);
  depsFiles = depsFiles.map(removed[0]);
  // Remove Exports from dependencies only
  // not remove exports from entry file depsFiles: DependenciesFiles;
  const deps_files = depsFiles
    .slice(0, -1)
    .map(removed[1]) as DependenciesFiles;
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

  // Call pre-process plugins
  content = await utils.plugins.preProcessPluginParser(
    plugins,
    content,
    point.fileName,
  );
  // Call pre-process internal hooks
  content = await InternalHooks.preProcessHooksParser(
    InternalHooks.getPreHooks(),
    content,
    point.fileName,
  );
  const entryFileName = point.fileName;
  // call ast plugins
  if (plugins.length) {
    for (const plugin of plugins) {
      const _plugin = typeof plugin === "function" ? plugin() : plugin;
      if (_plugin.type === "ast") {
        content = astTransformer(
          content,
          entryFileName,
          compilerOptions,
          _plugin.func,
        );
      }
    }
  }
  await utils.wait(1000);
  const tsOptions = point.tsOptions;
  const format = point.format;
  const exportPath = point.exportPath;
  const sourceCode = content;
  const result: BundledPoint = {
    entryFileName,
    sourceCode,
    tsOptions,
    exportPath,
    format,
    plugins,
    outDir: point.outDir,
  };
  // Returns
  console.timeEnd(
    `> ${tcolor.cyan(`Bundled`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
  );
  return result;
}

async function bundle(object: InitializedResult) {
  const points: BundledPoint[] = [];
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
