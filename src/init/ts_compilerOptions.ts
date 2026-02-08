import ts from "typescript";
import TsConfig from "@suseejs/tsconfig";
import type { EntryPoint, TsCompilerOptionsReturn } from "../types_def.js";

export default function tsCompilerOptions(
  entryPoint: EntryPoint,
): TsCompilerOptionsReturn {
  const config = new TsConfig(entryPoint.tsconfigFilePath);
  config.addCompilerOptions({ outDir: "dist" });
  config.removeCompilerOption("rootDir");
  config.removeCompilerOption("module");
  const commonJsModule = ts.ModuleKind.CommonJS;
  const esmModule = ts.ModuleKind.ES2022;
  const defaultCompilerOptions = config.getCompilerOptions();
  let { outDir, module, types, moduleResolution, ...restOptions } =
    defaultCompilerOptions;
  const baseOutDir = (outDir as string) ?? "dist";
  // normalize types into an array
  if (types && !Array.isArray(types)) {
    types = [types as unknown as string];
  }
  types = types ? [...(types as string[])] : [];

  const commonjs = () => {
    let out_dir = baseOutDir;
    // ensure `node` typings are present for node builds
    if (types && !types.includes("node")) types = ["node", ...types];
    if (entryPoint.output.target === "nodejs") {
      out_dir =
        entryPoint.output.exportPath === "."
          ? baseOutDir
          : `${baseOutDir}/${entryPoint.output.exportPath.slice(2)}`;
    }
    return {
      outDir: out_dir,
      types: types,
      module: commonJsModule,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      ...restOptions,
    } as ts.CompilerOptions;
  };
  const esm = () => {
    let out_dir = baseOutDir;
    // ensure `node` typings are present for node builds
    if (types && !types.includes("node")) types = ["node", ...types];
    if (entryPoint.output.target === "nodejs") {
      out_dir =
        entryPoint.output.exportPath === "."
          ? baseOutDir
          : `${baseOutDir}/${entryPoint.output.exportPath.slice(2)}`;
    }
    return {
      outDir: out_dir,
      types: types,
      module: esmModule,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      ...restOptions,
    } as ts.CompilerOptions;
  };
  const web = () => {
    const computedOutDir = baseOutDir;
    const webTypes = types ? [...types] : [];
    return {
      outDir: computedOutDir,
      types: webTypes,
      module: esmModule,
      ...restOptions,
    } as ts.CompilerOptions;
  };

  return {
    defaultCompilerOptions,
    commonJsCompilerOptions: commonjs,
    esmCompilerOptions: esm,
    webCompilerOptions: web,
  };
}
