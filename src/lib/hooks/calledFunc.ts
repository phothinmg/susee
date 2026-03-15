import type {
	DependenciesFiles,
	PostProcessPlugin,
	PreProcessPlugin,
} from "@suseejs/types";
import type ts from "typescript";

export type DepsHooks =
	| {
			type: "deps";
			async: true;
			func: (
				depFiles: DependenciesFiles,
				compilerOptions: ts.CompilerOptions,
				reName: boolean,
			) => Promise<DependenciesFiles>;
	  }
	| {
			type: "deps";
			async: false;
			func: (
				depFiles: DependenciesFiles,
				compilerOptions: ts.CompilerOptions,
				reName: boolean,
			) => DependenciesFiles;
	  };

export async function depHooksParser(
	depHooks: DepsHooks[],
	depFiles: DependenciesFiles,
	compilerOptions: ts.CompilerOptions,
	reName: boolean,
) {
	if (depHooks.length > 0) {
		for (const hook of depHooks) {
			if (hook.async) {
				depFiles = await hook.func(depFiles, compilerOptions, reName);
			} else {
				depFiles = hook.func(depFiles, compilerOptions, reName);
			}
		}
		return depFiles;
	} else {
		return depFiles;
	}
}

export async function preProcessHooksParser(
	preProcessHooks: PreProcessPlugin[],
	code: string,
	file?: string | undefined,
) {
	if (preProcessHooks.length) {
		for (const hook of preProcessHooks) {
			if (hook.async) {
				code = await hook.func(code, file);
			} else {
				code = hook.func(code, file);
			}
		}
	}
	return code;
}

export async function postProcessHooksParser(
	postProcessHooks: PostProcessPlugin[],
	code: string,
	file?: string | undefined,
) {
	if (postProcessHooks.length > 0) {
		for (const hook of postProcessHooks) {
			if (hook.async) {
				code = await hook.func(code, file);
			} else {
				code = hook.func(code, file);
			}
		}
	}
	return code;
}
