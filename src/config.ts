import type SuSee from "@suseejs/types";

export interface EntryPoint {
  /**
   * Entry of file path of package
   *
   * required
   */
  entry: string;
  /**
   * Export path for package
   *
   * required
   */
  exportPath: "." | `./${string}`;
  /**
   * Output module type of package , commonjs,esm or both esm and commonjs
   *
   * default - esm
   */
  moduleType?: "commonjs" | "esm" | "both";
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
   * Array of hooks to handle bundled and compiled code
   *
   * default - []
   */
  postProcessHooks?: SuSee.PostProcessHook[];
  /**
   * Allow bundler to update your package.json.
   *
   * default - true
   */
  allowUpdatePackageJson?: boolean;
  /**
   * Your package run on NodeJs env or not
   *
   * default - true
   */
  nodeEnv?: boolean;
  renameDuplicates?: boolean;
}
