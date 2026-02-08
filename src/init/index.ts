import ts from "typescript";
import generateDependencies from "./dependencies.js";
import tsCompilerOptions from "./ts_compilerOptions.js";
import getConfig from "./config.js";
import type { InitCollationsResult } from "../types_def.js";
import depsCheck from "./checks.js";

export default async function initCollations(): Promise<
  InitCollationsResult[]
> {
  const result: InitCollationsResult[] = [];
  const config = await getConfig();
  const points = config.entryPoints;
  for (const point of points) {
    const _opts = tsCompilerOptions(point);
    const deps = await generateDependencies(point.entry);
    const typesChecked = await depsCheck.make(
      deps.depFiles,
      _opts.esmCompilerOptions(),
      deps.includeNodeModules,
      point.output.target === "nodejs",
    );
    if (!typesChecked) {
      ts.sys.exit(1);
    }

    const collations: InitCollationsResult = {
      entryFileName: point.entry,
      outputTarget: point.output.target,
      dependencyFilesObject: deps.depFiles,
      includeNodeModules: deps.includeNodeModules,
      tsOptions: _opts,
      plugins: config.plugins ?? [],
      allowRenameDuplicates: point.renameDuplicates ?? true,
      allowUpdatePackageJson:
        point.output.target === "nodejs" && point.output.allowUpdatePackageJson
          ? point.output.allowUpdatePackageJson
          : point.output.target === "nodejs" &&
              !point.output.allowUpdatePackageJson
            ? true
            : false,
      outputFormat:
        point.output.target === "nodejs" && point.output.format
          ? point.output.format
          : point.output.target === "nodejs" && !point.output.format
            ? "esm"
            : undefined,
      exportPath:
        point.output.target === "nodejs" ? point.output.exportPath : undefined,
    };

    result.push(collations);
  }
  return result;
}
