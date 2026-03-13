import type { SuseePlugin, SuseePluginFunction } from "@suseejs/types";

/**
 * Entry point for SuSee configuration
 */
export interface EntryPoint {
  /**
   * Entry of file path of package
   *
   * required
   */
  entry: string;
  /**
   * Info for output
   *
   * required
   */
  /**
   *  path for package
   *
   * required
   */
  exportPath: "." | `./${string}`;
  /**
   * Output module type of package , commonjs,esm or both esm and commonjs
   *
   * default - esm
   */
  format?: "commonjs" | "esm" | "both";
  /**
   * Custom tsconfig.json path for package typescript compiler options
   *
   * Priority -
   *  1. this custom tsconfig.json
   *  2. tsconfig.json at root directory
   *  3. default compiler options of susee
   *
   * default - undefined
   */
  tsconfigFilePath?: string | undefined;
  /**
   * When bundling , if there are duplicate declared names , susee will auto rename , if renameDuplicates = false exist with code 1.
   *
   * default - true
   */
  renameDuplicates?: boolean;
}
/**
 * Configuration for Susee Bundler
 */
export interface SuSeeConfig {
  /**
   * Array of entry points object
   *
   * required
   */
  entryPoints: EntryPoint[];
  /**
   * Out directory
   *
   * default - dist
   */
  outDir?: string;
  /**
   * Array of susee extension
   *
   * default - []
   */
  plugins?: (SuseePlugin | SuseePluginFunction)[];
  /**
   * Allow bundler to update your package.json.
   *
   * default - true
   */
  allowUpdatePackageJson?: boolean;
}
