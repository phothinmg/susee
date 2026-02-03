import tcolor from "@suseejs/tcolor";
import type SuSee from "@suseejs/types";
import utils from "@suseejs/utils";
import ts from "typescript";
import checkExports from "./checkExports.js";
import createHost from "./host.js";
import { replaceInJs, replaceInTs } from "./replacecjs.js";
import { clearFolder, writeCompileFile } from "./write.js";

type CompilerOptions = {
	target?: SuSee.Target;
	configPath?: string | undefined;
};

class Compilers {
	files: SuSee.OutFiles;
	private _target: SuSee.Target;
	private _configPath: string | undefined;
	outDir: string;

	constructor(options?: CompilerOptions) {
		this._target = options?.target ?? "both";
		this._configPath = options?.configPath;
		this.files = {
			commonjs: undefined,
			commonjsTypes: undefined,
			esm: undefined,
			esmTypes: undefined,
			main: undefined,
			module: undefined,
			types: undefined,
		};
		this.outDir = "";
	}
	/**
	 * Compiles a TypeScript source string to CommonJS output, applies optional post-processing hooks,
	 * and writes emitted files to disk while updating internal file mappings.
	 *
	 * The method:
	 * - Checks for conflicting default and named exports and warns if both are present.
	 * - Creates a compiler host and emits output via the TypeScript program.
	 * - Optionally rewrites emitted JS/TS content when only a default export exists.
	 * - Runs asynchronous or synchronous post-process hooks on each emitted file.
	 * - Updates `this.files` mappings for CommonJS outputs and main/type entries when applicable.
	 * - Renames emitted extensions to `.cjs` and `.d.cts`, optionally clearing target folders.
	 *
	 * @param sourceCode - The TypeScript source content to compile.
	 * @param fileName - The virtual or real file name for the source.
	 * @param compilerOptions - TypeScript compiler options used for emission.
	 * @param isMain - Whether this compilation corresponds to the main entry.
	 * @param hooks - Optional post-process hooks applied to emitted content.
	 * @param isUpdate - Whether to update internal file path mappings.
	 * @returns A promise that resolves when all emitted files are written.
	 */
	async commonjs(
		sourceCode: string,
		fileName: string,
		compilerOptions: ts.CompilerOptions,
		isMain: boolean,
		hooks?: SuSee.PostProcessHook[],
		isUpdate = true,
	) {
		console.time(tcolor.green("Compiled Commonjs"));
		const ck = checkExports(fileName, sourceCode);
		if (ck.defExport && ck.nameExport) {
			console.warn(
				tcolor.yellow(
					"Both name export and default export are exported from your project,that will effect on default export for commonjs output",
				),
			);
		}
		// create host
		const _host = createHost(sourceCode, fileName);
		const createdFiles: Record<string, string> = _host.createdFiles;
		const host = _host.host;
		const program = ts.createProgram([fileName], compilerOptions, host);
		program.emit();
		Object.entries(createdFiles).map(async ([outName, content]) => {
			if (ck.defExport && !ck.nameExport) {
				const ext = utils.extname(outName);
				if (ext === ".js") {
					content = replaceInJs(fileName, content, compilerOptions);
				}
				if (ext === ".ts") {
					content = replaceInTs(fileName, content, compilerOptions);
				}
			}
			if (hooks?.length) {
				for (const hook of hooks) {
					if (hook.async) {
						content = await hook.func(content, outName);
					} else {
						content = hook.func(content, outName);
					}
				}
			}
			if (isUpdate) {
				if (outName.match(/.js/g)) {
					this.files.commonjs = outName.replace(/.js/g, ".cjs");
				}
				if (outName.match(/.d.ts/g)) {
					this.files.commonjsTypes = outName.replace(/.d.ts/g, ".d.cts");
				}

				if (
					isMain &&
					(this._target === "both" || this._target === "commonjs")
				) {
					if (this.files.commonjs) this.files.main = this.files.commonjs;
					if (this.files.commonjsTypes)
						this.files.types = this.files.commonjsTypes;
				}
			}

			outName = outName.replace(/.js/g, ".cjs");
			outName = outName.replace(/.map.js/g, ".map.cjs");
			outName = outName.replace(/.d.ts/g, ".d.cts");
			await utils.wait(500);
			if (this._target !== "both" && this._target !== "esm") {
				await clearFolder(utils.dirname(outName));
			}
			await writeCompileFile(outName, content);
		});
		console.timeEnd(tcolor.green("Compiled Commonjs"));
	}
	/**
	 * Compiles the provided source to ESM output, applies optional post-process hooks,
	 * updates internal output file references, and writes emitted files with ESM extensions.
	 *
	 * @param sourceCode - The TypeScript source text to compile.
	 * @param fileName - The virtual entry file name for the source.
	 * @param compilerOptions - TypeScript compiler options used for emission.
	 * @param isMain - Whether this compilation represents the main entry point.
	 * @param hooks - Optional post-processing hooks applied to each emitted file.
	 * @param isUpdate - Whether to update internal file reference metadata.
	 */
	async esm(
		sourceCode: string,
		fileName: string,
		compilerOptions: ts.CompilerOptions,
		isMain: boolean,
		hooks?: SuSee.PostProcessHook[],
		isUpdate = true,
	) {
		console.time(tcolor.green("Compiled ESM"));
		// create host
		const _host = createHost(sourceCode, fileName);
		const createdFiles: Record<string, string> = _host.createdFiles;
		const host = _host.host;
		const program = ts.createProgram([fileName], compilerOptions, host);
		program.emit();
		Object.entries(createdFiles).map(async ([outName, content]) => {
			if (hooks?.length) {
				for (const hook of hooks) {
					if (hook.async) {
						content = await hook.func(content, outName);
					} else {
						content = hook.func(content, outName);
					}
				}
			}
			if (isUpdate) {
				if (outName.match(/.js/g)) {
					this.files.esm = outName.replace(/.js/g, ".mjs");
				}
				if (outName.match(/.d.ts/g)) {
					this.files.esmTypes = outName.replace(/.d.ts/g, ".d.mts");
				}
				if (isMain && this._target === "both" && this.files.esm) {
					this.files.module = this.files.esm;
				}
			}

			outName = outName.replace(/.js/g, ".mjs");
			outName = outName.replace(/.map.js/g, ".map.mjs");
			outName = outName.replace(/.d.ts/g, ".d.mts");
			await utils.wait(500);
			if (this._target !== "commonjs") {
				await clearFolder(utils.dirname(outName));
			}
			await writeCompileFile(outName, content);
		});
		console.timeEnd(tcolor.green("Compiled ESM"));
	}
}
export default Compilers;
