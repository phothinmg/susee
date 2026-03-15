import path from "node:path";
import tcolor from "@suseejs/tcolor";
import type { OutFiles } from "@suseejs/types";
import ts from "typescript";
import type { BundledPoint, BundledResult } from "../bundle/index.js";
import { postProcessHooksParser } from "../hooks/calledFunc.js";
import internalHooks from "../hooks/index.js";
import utils from "../utils.js";
import createHost from "./host.js";
import writePackage from "./package.js";

class Compiler {
	private files: OutFiles;
	private object: BundledResult;
	constructor(object: BundledResult) {
		this.object = object;
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
	private _isUpdate() {
		return this.object.allowUpdatePackageJson;
	}
	/**
	 * Compiles a single file into a CommonJS module.
	 * @param point - a point containing the file name, source code, format, and plugins.
	 * @returns A promise that resolves when the compilation is complete.
	 */
	private async _commonjs(point: BundledPoint) {
		const isMain = point.exportPath === ".";
		console.time(
			`  ${tcolor.cyan(`Compiled commonjs`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
		);
		// init
		const fileName = point.entryFileName;
		const sourceCode = point.sourceCode;
		const format = point.format;
		const plugins = point.plugins;
		const compilerOptions = point.tsOptions.cjs;

		// create host
		const _host = createHost(sourceCode, fileName);
		const createdFiles: Record<string, string> = _host.createdFiles;
		const host = _host.host;
		const program = ts.createProgram([fileName], compilerOptions, host);
		program.emit();
		Object.entries(createdFiles).map(async ([outName, content]) => {
			// ------------------------------------
			const ext = path.extname(outName);
			if (ext === ".js") {
				content = await utils.plugins.postProcessPluginParser(
					plugins,
					content,
					outName,
				);
				content = await postProcessHooksParser(
					internalHooks.post(),
					content,
					outName,
				);
			}
			//----------------------------------------------------------------

			if (this._isUpdate()) {
				if (outName.match(/.js/g)) {
					this.files.commonjs = outName.replace(/.js/g, ".cjs");
				}
				if (outName.match(/.d.ts/g)) {
					this.files.commonjsTypes = outName.replace(/.d.ts/g, ".d.cts");
				}

				if (isMain && (format === "both" || format === "commonjs")) {
					if (this.files.commonjs) this.files.main = this.files.commonjs;
					if (this.files.commonjsTypes)
						this.files.types = this.files.commonjsTypes;
				}
			}

			outName = outName.replace(/.js/g, ".cjs");
			outName = outName.replace(/.map.js/g, ".map.cjs");
			outName = outName.replace(/.d.ts/g, ".d.cts");
			//await utils.wait(500);
			await utils.file.writeFile(outName, content);
		});
		console.timeEnd(
			`  ${tcolor.cyan(`Compiled commonjs`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
		);
	}
	/**
	 * Compiles a single file into an ESM module.
	 * @param point - a point containing the file name, source code, format, and plugins.
	 * @returns A promise that resolves when the compilation is complete.
	 */
	private async _esm(point: BundledPoint) {
		const isMain = point.exportPath === ".";
		console.time(
			`  ${tcolor.cyan(`Compiled esm`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
		);
		// init
		const fileName = point.entryFileName;
		const sourceCode = point.sourceCode;
		const format = point.format;
		const plugins = point.plugins;
		const compilerOptions = point.tsOptions.esm;

		// create host
		const _host = createHost(sourceCode, fileName);
		const createdFiles: Record<string, string> = _host.createdFiles;
		const host = _host.host;
		const program = ts.createProgram([fileName], compilerOptions, host);
		program.emit();
		Object.entries(createdFiles).map(async ([outName, content]) => {
			const ext = path.extname(outName);
			// ------------------------------------
			if (ext === ".js") {
				content = await utils.plugins.postProcessPluginParser(
					plugins,
					content,
					outName,
				);
				content = await postProcessHooksParser(
					internalHooks.post(),
					content,
					outName,
				);
			}
			//----------------------------------------------------------------

			if (this._isUpdate()) {
				if (outName.match(/.js/g)) {
					this.files.esm = outName.replace(/.js/g, ".mjs");
				}
				if (outName.match(/.d.ts/g)) {
					this.files.esmTypes = outName.replace(/.d.ts/g, ".d.mts");
				}
				if (isMain && format === "both" && this.files.esm) {
					this.files.module = this.files.esm;
				}
			}

			outName = outName.replace(/.js/g, ".mjs");
			outName = outName.replace(/.map.js/g, ".map.mjs");
			outName = outName.replace(/.d.ts/g, ".d.mts");
			//await utils.wait(500);
			await utils.file.writeFile(outName, content);
		});
		console.timeEnd(
			`  ${tcolor.cyan(`Compiled esm`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
		);
	}
	/**
	 * Compile bundled code for each entry point.
	 * This function will iterate through each entry point and compile code according to the format specified.
	 * If the format is "commonjs", it will compile the code into commonjs format.
	 * If the format is "esm", it will compile the code into esm format.
	 * If the format is "both", it will compile the code into both commonjs and esm formats.
	 * If the allowUpdatePackageJson flag is set to true, it will update the package.json according to the compiled file paths.
	 */
	async compile() {
		for (const point of this.object.points) {
			await utils.file.clearFolder(point.outDir);
			switch (point.format) {
				case "commonjs":
					await this._commonjs(point);
					if (this._isUpdate()) {
						await writePackage(this.files, point.exportPath);
					}
					break;
				case "esm":
					await this._esm(point);
					if (this._isUpdate()) {
						await writePackage(this.files, point.exportPath);
					}
					break;
				case "both":
					await this._esm(point);
					await utils.wait(1000);
					await this._commonjs(point);
					if (this._isUpdate()) {
						await writePackage(this.files, point.exportPath);
					}
					break;
			}
			await utils.wait(500);
		}
	}
}

export default Compiler;
