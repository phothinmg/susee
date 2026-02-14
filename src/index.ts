import type ts from "typescript";

export const pkgName = "SU-SEE";

export type OutFiles = {
  commonjs: string | undefined;
  commonjsTypes: string | undefined;
  esm: string | undefined;
  esmTypes: string | undefined;
  main: string | undefined;
  module: string | undefined;
  types: string | undefined;
};
export type Exports = Record<
  string,
  {
    import?: { default: string; types: string };
    require?: { default: string; types: string };
  }
>;
/*=========================== DEPS ============================= */
export interface DepsFile {
  file: string;
  content: string;
  length: number;
  size: {
    logical: number;
    allocated: number | null;
    utf8: number;
    buffBytes: number;
  };
  includeDefExport: boolean;
  type?: "cjs" | "esm";
}
export type DepsFiles = Array<DepsFile>;
export type DepsFilesTree = [Record<string, any>, ...DepsFiles];

/*=========================== PLUGINS ============================= */

// plugins
export type PostProcessPlugin =
  | {
      type: "post-process";
      async: true;
      func: (code: string, file?: string) => Promise<string>;
    }
  | {
      type: "post-process";
      async: false;
      func: (code: string, file?: string) => string;
    };
export type PreProcessPlugin =
  | {
      type: "pre-process";
      async: true;
      func: (code: string, file?: string) => Promise<string>;
    }
  | {
      type: "pre-process";
      async: false;
      func: (code: string, file?: string) => string;
    };
export type DependencyPlugin =
  | {
      type: "dependency";
      async: true;
      func: (depsFiles: DepsFiles) => Promise<DepsFiles>;
    }
  | {
      type: "dependency";
      async: false;
      func: (depsFiles: DepsFiles) => DepsFiles;
    };

export type ASTPlugin = {
  type: "ast";
  func: (node: ts.Node, factory: ts.NodeFactory, file: string) => ts.Node;
};

export type SuseePluginFunction = (
  ...args: any[]
) => ASTPlugin | DependencyPlugin | PostProcessPlugin | PreProcessPlugin;

export type SuseePlugin =
  | ASTPlugin
  | DependencyPlugin
  | PostProcessPlugin
  | PreProcessPlugin;

/* ==================== Config ============================== */
export interface Point {
  entry: string;
  exportPath: "." | `./${string}`;
  format: "commonjs" | "esm" | "both";
  tsconfigFilePath: string | undefined;
  renameDuplicates: boolean;
  outDir: string;
}

export type ConfigReturns = {
  points: Point[];
  plugins: (SuseePlugin | SuseePluginFunction)[];
  allowUpdatePackageJson: boolean;
};

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

/* ====================== INIT =========================== */
export interface CollatedPoint {
  fileName: string;
  exportPath: "." | `./${string}`;
  format: "commonjs" | "esm" | "both";
  rename: boolean;
  outDir: string;
  tsOptions: {
    cjs: ts.CompilerOptions;
    esm: ts.CompilerOptions;
    default: ts.CompilerOptions;
  };
  depFiles: DepsFiles;
  plugins: (SuseePlugin | SuseePluginFunction)[];
}

export interface CollatedReturn {
  points: CollatedPoint[];
  allowUpdatePackageJson: boolean;
}

/* ==================================== BUNDLE ============================= */
export type BundleHandler = (depsTree: DepsFile) => DepsFile;
export type NodeVisit = (node: ts.Node, isGlobalScope?: boolean) => ts.Node;
export type BundleVisitor = (
  context: ts.TransformationContext,
  depsTree: DepsFile,
  sourceFile: ts.SourceFile,
  ...args: any[]
) => NodeVisit;

export type BundleCreator = (
  bundleVisitor: BundleVisitor,
  compilerOptions: ts.CompilerOptions,
  ...args: any[]
) => BundleHandler;

export type RequireImportObject = {
  isNamespace: boolean;
  isTypeOnly: boolean;
  isTypeNamespace: boolean;
  source: string;
  importedString: string | undefined;
  importedObject: string[] | undefined;
};

export type TypeObj = Record<string, string[]>;

export interface NamesSet {
  base: string;
  file: string;
  newName: string;
  isEd?: boolean;
}
export type NamesSets = NamesSet[];

export type DuplicatesNameMap = Map<string, Set<{ file: string }>>;

export interface BundleResultPoint extends CollatedPoint {
  bundledContent: string;
}
export interface BundledResult {
  points: BundleResultPoint[];
  allowUpdatePackageJson: boolean;
}
