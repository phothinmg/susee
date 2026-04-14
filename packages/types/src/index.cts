import type ts = require("typescript");

const pkgName = "SU-SEE";
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
// Deps
export type JSExts =
  | ".js"
  | ".cjs"
  | ".mjs"
  | ".ts"
  | ".mts"
  | ".cts"
  | ".jsx"
  | ".tsx";

// DEPENDENCIES
export interface DependenciesFile {
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
  moduleType: "cjs" | "esm";
  fileExt: JSExts;
  isJsx: boolean;
}
export type DependenciesFiles = Array<DependenciesFile>;
// biome-ignore lint/suspicious/noExplicitAny: reason we need any here
export type DependenciesFilesTree = [Record<string, any>, ...DependenciesFiles];

// plugins
export type PostProcessPlugin =
  | {
      type: "post-process";
      async: true;
      func: (code: string, file?: string) => Promise<string>;
      name?: string;
    }
  | {
      type: "post-process";
      async: false;
      func: (code: string, file?: string) => string;
      name?: string;
    };
export type PreProcessPlugin =
  | {
      type: "pre-process";
      async: true;
      func: (code: string, file?: string) => Promise<string>;
      name?: string;
    }
  | {
      type: "pre-process";
      async: false;
      func: (code: string, file?: string) => string;
      name?: string;
    };
export type DependencyPlugin =
  | {
      type: "dependency";
      async: true;
      func: (
        DependenciesFiles: DependenciesFiles,
        compilerOptions: ts.CompilerOptions,
      ) => Promise<DependenciesFiles>;
      name?: string;
    }
  | {
      type: "dependency";
      async: false;
      func: (
        DependenciesFiles: DependenciesFiles,
        compilerOptions: ts.CompilerOptions,
      ) => DependenciesFiles;
      name?: string;
    };

export type ASTPlugin = {
  type: "ast";
  func: (node: ts.Node, factory: ts.NodeFactory, file: string) => ts.Node;
  name?: string;
};

export type SuseePluginFunction = (
  ...args: any[]
) => ASTPlugin | DependencyPlugin | PostProcessPlugin | PreProcessPlugin;

export type SuseePlugin =
  | ASTPlugin
  | DependencyPlugin
  | PostProcessPlugin
  | PreProcessPlugin;

// Bundle
export type BundleHandler = (depsTree: DependenciesFile) => DependenciesFile;

export type NodeVisit = (node: ts.Node, isGlobalScope?: boolean) => ts.Node;
export type BundleVisitor = (
  context: ts.TransformationContext,
  depsTree: DependenciesFile,
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

// Initialize

export type OutputFormat = ("commonjs" | "esm")[];
export interface InitializePoint {
  fileName: string;
  exportPath: "." | `./${string}`;
  format: OutputFormat;
  rename: boolean;
  outDir: string;
  tsOptions: {
    cjs: ts.CompilerOptions;
    esm: ts.CompilerOptions;
    default: ts.CompilerOptions;
    browser: ts.CompilerOptions;
  };
  depFiles: DependenciesFiles;
  plugins: (SuseePlugin | SuseePluginFunction)[];
}

export interface InitializeResult {
  points: InitializePoint[];
  allowUpdatePackageJson: boolean;
}

// bundle

export interface BundlePoint extends InitializePoint {
  bundledContent: string;
}

export interface BundledResult {
  points: BundlePoint[];
  allowUpdatePackageJson: boolean;
}

export { pkgName };
