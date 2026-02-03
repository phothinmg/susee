import TsConfig from "@suseejs/tsconfig";
import ts from "typescript";

const getCompilerOptions = (
  exportPath: "." | `./${string}`,
  configPath?: string,
) => {
  const config = new TsConfig(configPath);
  const generalOptions = () => config.getCompilerOptions();
  const commonjs = () => {
    const _config = new TsConfig(configPath);
    _config.addCompilerOptions({ outDir: "dist" });
    _config.removeCompilerOption("rootDir");
    _config.removeCompilerOption("module");
    const _options = _config.getCompilerOptions();
    let out_dir = _options.outDir as string;
    let isMain = true;
    if (exportPath !== ".") {
      out_dir = `${out_dir}/${exportPath.slice(2)}`;
      isMain = false;
    }
    const { outDir, module, ...restOptions } = _options;
    const compilerOptions: ts.CompilerOptions = {
      outDir: out_dir,
      module: ts.ModuleKind.CommonJS,
      ...restOptions,
    };
    return {
      isMain,
      compilerOptions,
      out_dir,
    };
  };
  const esm = () => {
    const __config = new TsConfig(configPath);
    __config.addCompilerOptions({ outDir: "dist" });
    __config.removeCompilerOption("rootDir");
    const _options = __config.getCompilerOptions();
    let out_dir = _options.outDir as string;
    let isMain = true;
    if (exportPath !== ".") {
      out_dir = `${out_dir}/${exportPath.slice(2)}`;
      isMain = false;
    }
    const { outDir, module, ...restOptions } = _options;
    const compilerOptions: ts.CompilerOptions = {
      outDir: out_dir,
      module: ts.ModuleKind.ES2022,
      ...restOptions,
    };
    return {
      isMain,
      compilerOptions,
      out_dir,
    };
  };
  return { commonjs, esm, generalOptions };
};

export default getCompilerOptions;
