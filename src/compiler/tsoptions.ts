import path from "node:path";
import tcolor from "@suseejs/color";
import ts6 from "@suseejs/ts6";

/**
 * Get the path of the configuration file.
 * If customConfigPath is provided and exists, use it.
 * If customConfigPath is not provided or does not exist, use the default configuration file.
 * @param {string | undefined} customConfigPath path of the custom configuration file.
 * @returns {string | undefined} path of the configuration file or undefined if customConfigPath does not exist.
 */
function getTsConfigPath(customConfigPath?: string | undefined): string | undefined {
  let config_path: string | undefined;
  if (customConfigPath) {
    if (!ts6.sys.fileExists(ts6.sys.resolvePath(customConfigPath))) {
      console.error(`> ${tcolor.magenta(`Given custom file ${customConfigPath} does not exists`)}`);
      ts6.sys.exit(1);
    }
    config_path = customConfigPath;
    return config_path;
  } else {
    config_path = ts6.findConfigFile(ts6.sys.getCurrentDirectory(), ts6.sys.fileExists);
    return config_path;
  }
}

/**
 * Get the TypeScript compiler options for susee bundler.
 * @param {string | undefined} customConfigPath path of the custom configuration file.
 */
function getCompilerOptions(customConfigPath?: string | undefined): {
  commonjs: (out_dir?: string | undefined) => ts6.CompilerOptions;
  esm: (out_dir?: string | undefined) => ts6.CompilerOptions;
  defaultOptions: () => ts6.CompilerOptions;
} {
  let tsconfig_opts: ts6.CompilerOptions | undefined;
  const config_path = getTsConfigPath(customConfigPath);
  if (config_path) {
    const config = ts6.readConfigFile(config_path, ts6.sys.readFile);
    const basePath = path.dirname(config_path);
    const parsed = ts6.parseJsonConfigFileContent(config.config, ts6.sys, basePath);
    tsconfig_opts = { ...parsed.options };
  }

  const commonjs = (out_dir?: string | undefined): ts6.CompilerOptions => {
    const _out = out_dir ? out_dir : "dist";
    if (tsconfig_opts !== undefined) {
      // oxlint-disable-next-line no-unused-vars
      const { rootDir, outDir, module, allowJs, declarationDir, ...rest } = tsconfig_opts;
      return {
        outDir: _out,
        module: ts6.ModuleKind.CommonJS,
        allowJs: true,
        ...rest,
      } as ts6.CompilerOptions;
    } else {
      return {
        outDir: _out,
        module: ts6.ModuleKind.CommonJS,
        target: ts6.ScriptTarget.Latest,
      } as ts6.CompilerOptions;
    }
  };
  const esm = (out_dir?: string | undefined): ts6.CompilerOptions => {
    const _out = out_dir ? out_dir : "dist";
    if (tsconfig_opts !== undefined) {
      // oxlint-disable-next-line no-unused-vars
      const { rootDir, outDir, module, allowJs, declarationDir, ...rest } = tsconfig_opts;
      return {
        outDir: _out,
        module: ts6.ModuleKind.ES2020,
        allowJs: true,
        ...rest,
      } as ts6.CompilerOptions;
    } else {
      return {
        outDir: _out,
        module: ts6.ModuleKind.ES2020,
        target: ts6.ScriptTarget.Latest,
      } as ts6.CompilerOptions;
    }
  };
  const defaultOptions = ts6.getDefaultCompilerOptions;
  return { commonjs, esm, defaultOptions };
}

export { getCompilerOptions };
