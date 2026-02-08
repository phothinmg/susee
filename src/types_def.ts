import type ts from "typescript";

export type Target = "commonjs" | "esm" | "both";
export interface DepsFile {
	file: string;
	content: string;
}
export interface NamesSet {
	base: string;
	file: string;
	newName: string;
	isEd?: boolean;
}
export type NamesSets = NamesSet[];

export type DuplicatesNameMap = Map<string, Set<{ file: string }>>;

export type BundleHandler = ({ file, content }: DepsFile) => DepsFile;

export type NodeVisit = (node: ts.Node) => ts.Node;
export type BundleVisitorFunc = (
	context: ts.TransformationContext,
	{ file, content }: DepsFile,
	sourceFile: ts.SourceFile,
	...args: any[]
) => NodeVisit;

export interface NamesMap {
	base: string;
	file: string;
	short: string;
	oldName: string;
}

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
export type LocalHookReturn = string | ts.Node | BundleHandler;
export type LocalHookReturnFun<P extends any[] = any[], M = LocalHookReturn> = (
	...args: P
) => M;
export type LocalHookKey =
	| "commonJsHook"
	| "removeCommonJsExports"
	| "removeEsmExports";

export type LocalHook<P extends any[] = any[], M = LocalHookReturn> = {
	name: LocalHookKey;
	fun: LocalHookReturnFun<P, M>;
};

export interface DepsObj {
	depFiles: DepsFile[];
	modOpts: {
		commonjs: () => {
			isMain: boolean;
			compilerOptions: ts.CompilerOptions;
			out_dir: string;
		};
		esm: () => {
			isMain: boolean;
			compilerOptions: ts.CompilerOptions;
			out_dir: string;
		};
	};
	generalOptions: ts.CompilerOptions;
}

export type RequireImportObject = {
	isNamespace: boolean;
	isTypeOnly: boolean;
	isTypeNamespace: boolean;
	source: string;
	importedString: string | undefined;
	importedObject: string[] | undefined;
};

export type TypeObj = Record<string, string[]>;

// plugin

export type PrePostPluginAsyncCallback = (
	code: string,
	file?: string,
) => Promise<string>;
export type PrePostPluginCallback = (code: string, file?: string) => string;

export type ASTPluginCallback = (
	node: ts.Node,
	factory: ts.NodeFactory,
	file: string,
) => ts.Node;
export type ASTPluginAsyncCallback = (
	node: ts.Node,
	factory: ts.NodeFactory,
	file: string,
) => Promise<ts.Node>;

export type DependencyPluginAsyncCallback = (
	files: DepsFile[],
) => Promise<DepsFile[]>;
export type DependencyPluginCallback = (files: DepsFile[]) => DepsFile[];

export type PostProcessPlugin =
	| {
			type: "post-process";
			async: true;
			func: PrePostPluginAsyncCallback;
	  }
	| {
			type: "post-process";
			async: false;
			func: PrePostPluginCallback;
	  };
export type PreProcessPlugin =
	| {
			type: "pre-process";
			async: true;
			func: PrePostPluginAsyncCallback;
	  }
	| {
			type: "pre-process";
			async: false;
			func: PrePostPluginCallback;
	  };
export type DependencyPlugin =
	| {
			type: "dependency";
			async: true;
			func: (files: DepsFile[]) => Promise<DepsFile[]>;
	  }
	| {
			type: "dependency";
			async: false;
			func: (files: DepsFile[]) => DepsFile[];
	  };

export type ASTPlugin = {
	type: "ast";
	func: ASTPluginCallback;
};

type _Plugins =
	| ASTPlugin
	| DependencyPlugin
	| PostProcessPlugin
	| PreProcessPlugin;

export type ASTPluginParserReturnFn = (
	fileName: string,
	sourceCode: string,
	compilerOptions: ts.CompilerOptions,
) => string;

export type PrePostProcessPluginParserReturnFn = (
	code: string,
	file?: string,
) => string;

export type DependencyPluginParserReturnFn = (files: DepsFile[]) => DepsFile[];

export type PluginParserReturnFn =
	| ASTPluginParserReturnFn
	| PrePostProcessPluginParserReturnFn
	| DependencyPluginParserReturnFn;

export type SuseePluginFunc = (
	...args: any[]
) => ASTPlugin | DependencyPlugin | PostProcessPlugin | PreProcessPlugin;

export type SuseePlugin =
	| ASTPlugin
	| DependencyPlugin
	| PostProcessPlugin
	| PreProcessPlugin
	| SuseePluginFunc;
export type SuseePlugins = SuseePlugin[];

// config

type NodeJsOutput = {
	target: "nodejs";
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
	 * Allow bundler to update your package.json.
	 *
	 * default - true
	 */
	allowUpdatePackageJson?: boolean;
};

type WebOutput = { target: "web"; outFile: string; htmlTemplate: string };

/**
 * Entry point for SuSee configuration
 */
export type EntryPoint = {
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
	output: NodeJsOutput | WebOutput;
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
};

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
	 * Array of susee extension
	 *
	 * default - []
	 */
	plugins?: SuseePlugins;
}

export type TsCompilerOptionsReturn = {
	defaultCompilerOptions: ts.CompilerOptions;
	commonJsCompilerOptions: () => ts.CompilerOptions;
	esmCompilerOptions: () => ts.CompilerOptions;
	webCompilerOptions: () => ts.CompilerOptions;
};

export type InitCollationsResult = {
	dependencyFilesObject: DepsFile[];
	tsOptions: TsCompilerOptionsReturn;
	plugins: SuseePlugin[];
	includeNodeModules: boolean;
	allowRenameDuplicates: boolean;
	allowUpdatePackageJson: boolean;
	outputTarget: "nodejs" | "web";
	entryFileName: string;
	outputFormat: "commonjs" | "esm" | "both" | undefined;
	exportPath: "." | `./${string}` | undefined;
};

export type BundleResult = {
	tsOptions: TsCompilerOptionsReturn;
	plugins: SuseePlugin[];
	includeNodeModules: boolean;
	allowRenameDuplicates: boolean;
	allowUpdatePackageJson: boolean;
	outputTarget: "nodejs" | "web";
	entryFileName: string;
	outputFormat: "commonjs" | "esm" | "both" | undefined;
	exportPath: "." | `./${string}` | undefined;
	bundleContent: string;
};
