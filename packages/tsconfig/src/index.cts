import ts = require("typescript");
import tcolor = require("@suseejs/tcolor");
import path = require("node:path");

const undefinedOptions = {
  allowArbitraryExtensions: undefined,
  allowImportingTsExtensions: undefined,
  allowJs: undefined,
  allowSyntheticDefaultImports: undefined,
  allowUmdGlobalAccess: undefined,
  allowUnreachableCode: undefined,
  allowUnusedLabels: undefined,
  alwaysStrict: undefined,
  assumeChangesOnlyAffectDirectDependencies: undefined,
  baseUrl: undefined,
  checkJs: undefined,
  composite: undefined,
  customConditions: undefined,
  declaration: undefined,
  declarationDir: undefined,
  declarationMap: undefined,
  disableReferencedProjectLoad: undefined,
  disableSizeLimit: undefined,
  disableSolutionSearching: undefined,
  disableSourceOfProjectReferenceRedirect: undefined,
  downlevelIteration: undefined,
  emitBOM: undefined,
  emitDeclarationOnly: undefined,
  emitDecoratorMetadata: undefined,
  erasableSyntaxOnly: undefined,
  esModuleInterop: undefined,
  exactOptionalPropertyTypes: undefined,
  experimentalDecorators: undefined,
  forceConsistentCasingInFileNames: undefined,
  ignoreDeprecations: undefined,
  importHelpers: undefined,
  incremental: undefined,
  inlineSourceMap: undefined,
  inlineSources: undefined,
  isolatedDeclarations: undefined,
  isolatedModules: undefined,
  jsx: undefined,
  jsxFactory: undefined,
  jsxFragmentFactory: undefined,
  jsxImportSource: undefined,
  lib: undefined,
  libReplacement: undefined,
  locale: undefined,
  mapRoot: undefined,
  maxNodeModuleJsDepth: undefined,
  // ----------------------------
  module: undefined,
  moduleDetection: undefined,
  moduleResolution: undefined,
  moduleSuffixes: undefined,
  newLine: undefined,
  noCheck: undefined,
  noEmit: undefined,
  noEmitHelpers: undefined,
  noEmitOnError: undefined,
  noErrorTruncation: undefined,
  noFallthroughCasesInSwitch: undefined,
  noImplicitAny: undefined,
  noImplicitOverride: undefined,
  noImplicitReturns: undefined,
  noImplicitThis: undefined,
  noLib: undefined,
  noPropertyAccessFromIndexSignature: undefined,
  noResolve: undefined,
  noUncheckedIndexedAccess: undefined,
  noUncheckedSideEffectImports: undefined,
  noUnusedLocals: undefined,
  noUnusedParameters: undefined,
  outDir: undefined,
  outFile: undefined,
  paths: undefined,
  preserveConstEnums: undefined,
  preserveSymlinks: undefined,
  project: undefined,
  reactNamespace: undefined,
  removeComments: undefined,
  resolveJsonModule: undefined,
  resolvePackageJsonExports: undefined,
  resolvePackageJsonImports: undefined,
  rewriteRelativeImportExtensions: undefined,
  rootDir: undefined,
  rootDirs: undefined,
  skipDefaultLibCheck: undefined,
  skipLibCheck: undefined,
  sourceMap: undefined,
  sourceRoot: undefined,
  strict: undefined,
  strictBindCallApply: undefined,
  strictBuiltinIteratorReturn: undefined,
  strictFunctionTypes: undefined,
  strictNullChecks: undefined,
  strictPropertyInitialization: undefined,
  stripInternal: undefined,
  target: undefined,
  traceResolution: undefined,
  tsBuildInfoFile: undefined,
  typeRoots: undefined,
  types: undefined,
  useDefineForClassFields: undefined,
  useUnknownInCatchVariables: undefined,
  verbatimModuleSyntax: undefined,
};

type OptionKeys = keyof typeof undefinedOptions;

const defaultOptions: ts.CompilerOptions = {
  // Recommended Options
  strict: true,
  jsx: ts.JsxEmit.ReactJSX,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  noUncheckedSideEffectImports: true,
  moduleDetection: ts.ModuleDetectionKind.Force,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  // Stricter Typechecking Options
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
};

class TsConfig {
  private _customConfig: string | undefined;
  private _options: ts.CompilerOptions;
  private _parsed: ts.ParsedCommandLine | undefined;
  constructor(customConfigFile?: string) {
    if (
      customConfigFile &&
      !ts.sys.fileExists(ts.sys.resolvePath(customConfigFile))
    ) {
      console.error(
        tcolor.magenta("Given custom `tsconfig.json` file does not exists"),
      );
      ts.sys.exit(1);
    }
    this._customConfig = customConfigFile
      ? ts.sys.resolvePath(customConfigFile)
      : undefined;
    this._options = {};
    this._parsed = undefined;
    this.init();
  }
  private _merge(
    optA: ts.CompilerOptions,
    optB: ts.CompilerOptions,
  ): ts.CompilerOptions {
    let C: ts.CompilerOptions = {};
    const keyA = Object.keys(optA);
    const keyB = Object.keys(optB);
    for (const ka of keyA) {
      if (ka in optB) {
        C[ka] = optB[ka];
      } else {
        C[ka] = optB[ka];
      }
    }
    for (const kb of keyB) {
      if (!(kb in optA)) {
        C[kb] = optB[kb];
      }
    }
    return C;
  }
  private init() {
    const config_path: string | undefined = this._customConfig
      ? this._customConfig
      : ts.findConfigFile(ts.sys.getCurrentDirectory(), ts.sys.fileExists);
    if (config_path) {
      const config = ts.readConfigFile(config_path, ts.sys.readFile);
      const basePath = path.dirname(config_path);
      const parsed = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        basePath,
      );
      this._parsed = parsed;
      this._options = { ...this._merge(defaultOptions, parsed.options) };
    } else {
      console.warn(
        tcolor.yellow(
          "No tsconfig.json found, return compiler options will be default options.",
        ),
      );
      this._options = { ...defaultOptions };
    }
  }
  /**
   * Edit the compiler options
   * @param {ts.CompilerOptions} options
   * @returns {this}
   * @example
   * const config = new TsConfig();
   * config.editCompilerOptions({
   *   strict: false,
   *   noImplicitAny: true,
   * });
   */
  public editCompilerOptions(options: ts.CompilerOptions): this {
    for (const key of Object.keys(options)) {
      this._options[key] = options[key];
    }
    return this;
  }
  /**
   * Remove a compiler option.
   * If the option does not exist, do nothing.
   * @param {OptionKeys} key - The key of the option to be removed
   * @returns {this}
   * @example
   * const config = new TsConfig();
   * config.removeCompilerOption('strict');
   */
  public removeCompilerOption(key: OptionKeys): this {
    if (key in this._options) {
      delete this._options[key];
    }
    return this;
  }
  /**
   * Add compiler options to the existing options.
   * It will only add the options that are not already set.
   * @param {ts.CompilerOptions} options - The options to be added
   * @returns {this}
   * @example
   * const config = new TsConfig();
   * config.addCompilerOptions({
   *   strict: false,
   *   noImplicitAny: true,
   * });
   */
  public addCompilerOptions(options: ts.CompilerOptions) {
    for (const key of Object.keys(options)) {
      if (!(key in this._options)) {
        this._options[key] = options[key];
      }
    }
    return this;
  }
  /**
   * Get the parsed configuration file.
   * If no tsconfig.json file is found, returns undefined.
   * @returns {ts.ParsedCommandLine | undefined} The parsed configuration file or undefined if no tsconfig.json file is found.
   * @example
   * const config = new TsConfig();
   * const parsed = config.getParsedConfig();
   * if (parsed) {
   *   console.log(parsed.options);
   * } else {
   *   console.log('No tsconfig.json found.');
   * }
   */
  public getParsedConfig(): ts.ParsedCommandLine | undefined {
    return this._parsed;
  }
  /**
   * Get the current compiler options.
   * @returns {ts.CompilerOptions} The current compiler options
   * @example
   * const config = new TsConfig();
   * const options = config.getCompilerOptions();
   * console.log(options);
   */
  public getCompilerOptions(): ts.CompilerOptions {
    return this._options;
  }
}

export = TsConfig;
