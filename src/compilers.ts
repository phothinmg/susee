import path from "node:path";
import ts from "typescript";
import { wait, writeOutFile } from "./helpers";
import type { OutFiles, OutPutHook, Target } from "./types";

class Compilers {
	files: OutFiles;
	private _target: Target;
	constructor(target?: Target) {
		this._target = target ?? "both";
		this.files = {
			commonjs: undefined,
			commonjsTypes: undefined,
			esm: undefined,
			esmTypes: undefined,
			main: undefined,
			module: undefined,
			types: undefined,
		};
	}
	async commonjs(
		sourceCode: string,
		fileName: string,
		outDir: string,
		isMain = true,
		defaultExportName?: string | undefined,
		replaceWithBlank?: string[],
		hooks?: OutPutHook[],
	) {
		console.time("Compiled Commonjs");
		const defExport = defaultExportName ? defaultExportName : "";
		const _replaceWithBlank = replaceWithBlank ? replaceWithBlank : [];
		const compilerOptions: ts.CompilerOptions = {
			outDir,
			module: ts.ModuleKind.CommonJS,
			sourceMap: true,
			strict: true,
			esModuleInterop: true,
			noImplicitAny: true,
			declaration: true,
		};
		const createdFiles: Record<string, string> = {};
		const host: ts.CompilerHost = {
			getSourceFile: (file, languageVersion) => {
				if (file === fileName) {
					return ts.createSourceFile(file, sourceCode, languageVersion);
				}
				return undefined;
			},
			writeFile: (fileName, contents) => {
				createdFiles[fileName] = contents;
			},
			getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
			getCurrentDirectory: () => "",
			getDirectories: () => [],
			fileExists: (file) => file === fileName,
			readFile: (file) => (file === fileName ? sourceCode : undefined),
			getCanonicalFileName: (file) => file,
			useCaseSensitiveFileNames: () => true,
			getNewLine: () => "\n",
		};
		// ===
		const program = ts.createProgram([fileName], compilerOptions, host);
		program.emit();
		Object.entries(createdFiles).map(async ([outName, content]) => {
			const ext = path.extname(outName);
			if (ext === ".js") {
				content = content.replace(
					`exports.default = ${defExport};`,
					`module.exports = ${defExport};`,
				);
				if (_replaceWithBlank.length > 0) {
					for (const str of _replaceWithBlank) {
						content = content.replace(str, "").trim();
					}
				}
			}
			if (ext === ".ts") {
				content = content.replace(
					`export default ${defExport};`,
					`export = ${defExport};`,
				);
				if (_replaceWithBlank.length > 0) {
					for (const str of _replaceWithBlank) {
						content = content.replace(str, "").trim();
					}
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
			if (outName.match(/.js/g)) {
				this.files.commonjs = outName.replace(/.js/g, ".cjs");
			}
			if (outName.match(/.d.ts/g)) {
				this.files.commonjsTypes = outName.replace(/.d.ts/g, ".d.cts");
			}

			if (isMain && (this._target === "both" || this._target === "commonjs")) {
				if (this.files.commonjs) this.files.main = this.files.commonjs;
				if (this.files.commonjsTypes)
					this.files.types = this.files.commonjsTypes;
			}
			outName = outName.replace(/.js/g, ".cjs");
			outName = outName.replace(/.map.js/g, ".map.cjs");
			outName = outName.replace(/.d.ts/g, ".d.cts");
			await wait(500);
			writeOutFile(outName, content);
		});
		console.timeEnd("Compiled Commonjs");
	}
	async esm(
		sourceCode: string,
		fileName: string,
		outDir: string,
		isMain = true,
		hooks?: OutPutHook[],
	) {
		console.time("Compiled ESM");
		const compilerOptions: ts.CompilerOptions = {
			outDir,
			module: ts.ModuleKind.ES2020,
			sourceMap: true,
			strict: true,
			esModuleInterop: true,
			noImplicitAny: true,
			declaration: true,
		};
		const createdFiles: Record<string, string> = {};
		const host: ts.CompilerHost = {
			getSourceFile: (file, languageVersion) => {
				if (file === fileName) {
					return ts.createSourceFile(file, sourceCode, languageVersion);
				}
				return undefined;
			},
			writeFile: (fileName, contents) => {
				createdFiles[fileName] = contents;
			},
			getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
			getCurrentDirectory: () => "",
			getDirectories: () => [],
			fileExists: (file) => file === fileName,
			readFile: (file) => (file === fileName ? sourceCode : undefined),
			getCanonicalFileName: (file) => file,
			useCaseSensitiveFileNames: () => true,
			getNewLine: () => "\n",
		};
		// ===
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
			if (outName.match(/.js/g)) {
				this.files.esm = outName.replace(/.js/g, ".mjs");
			}
			if (outName.match(/.d.ts/g)) {
				this.files.esmTypes = outName.replace(/.d.ts/g, ".d.mts");
			}
			if (isMain && this._target === "both" && this.files.esm) {
				this.files.module = this.files.esm;
			}
			outName = outName.replace(/.js/g, ".mjs");
			outName = outName.replace(/.map.js/g, ".map.mjs");
			outName = outName.replace(/.d.ts/g, ".d.mts");
			await wait(500);
			writeOutFile(outName, content);
		});
		console.timeEnd("Compiled ESM");
	}
}

export default Compilers;
