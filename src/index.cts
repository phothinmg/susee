import ts = require("typescript");
import process = require("node:process");
import path = require("node:path");

/**
 * Returns the default TypeScript compiler options and a function to merge additional options.
 *
 * If a path to a custom tsconfig file is provided, it will be used to override the default options.
 * If no path is provided, the function will search for a tsconfig file in the current working directory.
 *
 * The returned object has two properties:
 * - `options`: The default or custom compiler options.
 * - `mergeOptions`: A function that takes an object with additional options to merge with the default or custom options.
 */
function tsconfig(customTsConfigPath?: string) {
  const root = process.cwd();
  let options = ts.getDefaultCompilerOptions();
  const configPath = customTsConfigPath
    ? path.resolve(root, customTsConfigPath)
    : ts.findConfigFile(root, ts.sys.fileExists);
  if (configPath) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const basePath = path.dirname(configPath);
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      basePath,
    );
    options = parsed.options;
  }
  /**
   * Merges additional options with the default or custom compiler options.
   * If the key of an additional option already exists in the default or custom options,
   * the value of the additional option will overwrite the existing value.
   * @param overwriteOptions - An object with additional options to merge with the default or custom options.
   * @returns The merged options object.
   */
  const mergeOptions = (overwriteOptions: ts.CompilerOptions) => {
    const mergedOptions: ts.CompilerOptions = { ...options };
    for (const key of Object.keys(overwriteOptions)) {
      if (key in options) {
        mergedOptions[key] = overwriteOptions[key];
      }
    }
    return mergedOptions;
  };
  return {
    options,
    mergeOptions,
  };
}

export = tsconfig;
