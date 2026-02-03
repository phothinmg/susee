import type SuSee from "@suseejs/types";
import utils from "@suseejs/utils";
import ts from "typescript";
import depsCheck from "./checks.js";
import getDependencies from "./deps.js";
import getCompilerOptions from "./getOptions.js";

/*
Module `entry`
===========================================================

Dependencies management and get TypeScript compiler options.

1. Get Dependencies : 

- Dependency Graph Generation
- Circular Dependency Detection
- Topological Sorting
- Node Built-in Detection

2. Checking :

- Check for TypeScript extensions  : The package supports only [".ts",".mts",".cts",".tsx"]
- Check for Node Built-in : If nodeEnv is false in susee config and NodeJs built-in modules in dependency graph,
  process will exit with code 1.
- Check for module types : The package supports only esm.
- Type checking by TypeScript : Disables this type checking by enable noCheck in compilerOptions of tsconfig.json.

3. Compiler Options :

- If custom tsconfig file in susee config and this config file dose not exists process exit with code 1,
  else look for tsconfig.json at root of the project or default compiler options.

4. Returns

- Dependencies files object
- Functions object for get compiler options of module type (commonjs or esm)

5. Dependencies of this module :

- typescript
- @suseejs/dependencies
- @suseejs/utils
- @suseejs/types
- @suseejs/tsconfig
- @suseejs/tcolor

 */

interface DependencyOpts {
	entryPath: string;
	exportPath: "." | `./${string}`;
	configPath?: string | undefined;
	nodeEnv?: boolean;
}
interface DepsObj {
	depFiles: SuSee.DepsFile[];
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
/**
 * @module dependency
 * Resolves dependencies for a given entry.
 * @param {DependencyOpts} opts - Options for this function.
 * @param {string} opts.entryPoint - The entry point to resolve dependencies for.
 * @param {"./" | `./${string}`} opts.exportPath - The export path for the resolved dependencies.
 * @param {string} [opts.configPath] - The path to a custom tsconfig file.
 * @param {boolean} [opts.nodeEnv] - Whether to use the Node environment.
 * @returns {Promise<DepsObj>} - A promise that resolves with an object containing the resolved dependencies and compiler options.
 */
async function entry({
	entryPath,
	exportPath,
	configPath,
	nodeEnv,
}: DependencyOpts): Promise<DepsObj> {
	// deps
	const deps = await getDependencies(entryPath);
	const depFiles: SuSee.DepsFile[] = deps.depFiles; /* return */
	const nodeModules: string[] = deps.nodeModules;
	await utils.wait(1000);
	const opts = getCompilerOptions(exportPath, configPath);
	const generalOptions = opts.generalOptions();
	const modOpts = {
		commonjs: () => opts.commonjs(),
		esm: () => opts.esm(),
	}; /* return */
	await utils.wait(1000);
	const checked = await depsCheck.make(
		depFiles,
		generalOptions,
		nodeModules,
		nodeEnv,
	);
	if (!checked) {
		ts.sys.exit(1);
	}
	return {
		depFiles,
		modOpts,
		generalOptions,
	};
}

export default entry;
