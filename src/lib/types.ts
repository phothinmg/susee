import type ts from "typescript";

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

// PLUGINS
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
				depsFiles: DependenciesFile,
				compilerOptions: ts.CompilerOptions,
			) => Promise<DependenciesFile>;
			name?: string;
	  }
	| {
			type: "dependency";
			async: false;
			func: (
				depsFiles: DependenciesFile,
				compilerOptions: ts.CompilerOptions,
			) => DependenciesFile;
			name?: string;
	  };

export type ASTPlugin = {
	type: "ast";
	func: (node: ts.Node, factory: ts.NodeFactory, file: string) => ts.Node;
	name?: string;
};

export type SuseePluginFunction = (
	// biome-ignore lint/suspicious/noExplicitAny: reason we need any here
	...args: any[]
) => ASTPlugin | DependencyPlugin | PostProcessPlugin | PreProcessPlugin;

export type SuseePlugin =
	| ASTPlugin
	| DependencyPlugin
	| PostProcessPlugin
	| PreProcessPlugin;

// SUSEE CONFIG

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
