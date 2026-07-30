import type ts6 from "@suseejs/ts6";

export const pkgName = "SUSEEJS";
// 1. Bundler

export type ValidExts =
	| ".js"
	| ".cjs"
	| ".mjs"
	| ".ts"
	| ".cts"
	| ".mts"
	| ".tsx"
	| ".jsx"
	| ".json";
export interface DepsFile {
	file: string;
	content: string;
	bytes: number;
	moduleType: "cjs" | "esm" | "json";
	fileExt: ValidExts;
	is_jsx: boolean;
	is_entry: boolean;
}
export type DepsFiles = DepsFile[];
export interface DependenciesTree {
	entry: string;
	npm: string[];
	nodes: string[];
	warns: string[];
	depFiles: DepsFiles;
}
export interface NamesSet {
	base: string;
	file: string;
	newName: string;
	isEd?: boolean;
}
export type NamesSets = NamesSet[];

export type DuplicatesNameMap = Map<string, Set<{ file: string }>>;

export type BundledHandler = ({ file, content, ...rest }: DepsFile) => DepsFile;

export type RequireImportObject = {
	isNamespace: boolean;
	isTypeOnly: boolean;
	isTypeNamespace: boolean;
	source: string;
	importedString: string | undefined;
	importedObject: string[] | undefined;
};

export type TypeObj = Record<string, string[]>;

// 2. Plugins
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
				depsFiles: DepsFiles,
				compilerOptions: ts6.CompilerOptions,
			) => Promise<DepsFiles>;
			name?: string;
	  }
	| {
			type: "dependency";
			async: false;
			func: (
				DepsFiles: DepsFiles,
				compilerOptions: ts6.CompilerOptions,
			) => DepsFiles;
			name?: string;
	  };

export type SuseePluginFunction = (
	// biome-ignore  lint/suspicious/noExplicitAny: its args
	...args: any[]
) => DependencyPlugin | PostProcessPlugin | PreProcessPlugin;

export type SuseePlugin =
	| DependencyPlugin
	| PostProcessPlugin
	| PreProcessPlugin;

export type SuseePlugins = (SuseePluginFunction | SuseePlugin)[];
