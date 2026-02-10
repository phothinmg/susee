import path from "node:path";
import tcolor from "@suseejs/tcolor";
import type {
	BundledResult,
	BundleResultPoint,
	OutFiles,
} from "@suseejs/types";
import utilities from "@suseejs/utils";
import ts from "typescript";
import createHost from "./host.js";
import writePackage from "./package.js";

export function splitCamelCase(str: string) {
	const splitString = str
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/(_|-|\/)([a-z] || [A-Z])/g, " ")
		.replace(/([A-Z])/g, (match) => match.toLowerCase())
		.replace(/^([a-z])/, (match) => match.toUpperCase());
	return splitString;
}

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
	private async _commonjs(point: BundleResultPoint) {
		const isMain = point.exportPath === ".";
		const _name = isMain ? "Main" : splitCamelCase(point.exportPath.slice(2));
		console.time(tcolor.green(`Compiled Commonjs ${_name} output.`));
		// init
		const fileName = point.fileName;
		const sourceCode = point.bundledContent;
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
			if (plugins.length) {
				for (let plugin of plugins) {
					plugin = typeof plugin === "function" ? plugin() : plugin;
					if (plugin.type === "post-process") {
						if (plugin.async) {
							content = await plugin.func(content, outName);
						} else {
							content = plugin.func(content, outName);
						}
					}
				}
			}
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
			await utilities.wait(500);
			if (format === "commonjs") {
				await utilities.clearFolder(path.dirname(outName));
			}
			await utilities.writeCompileFile(outName, content);
		});
		console.timeEnd(tcolor.green(`Compiled Commonjs ${_name} output.`));
	}
	private async _esm(point: BundleResultPoint) {
		const isMain = point.exportPath === ".";
		const _name = isMain ? "Main" : splitCamelCase(point.exportPath.slice(2));
		console.time(tcolor.green(`Compiled ESM ${_name} output.`));
		// init
		const fileName = point.fileName;
		const sourceCode = point.bundledContent;
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
			if (plugins.length) {
				for (let plugin of plugins) {
					plugin = typeof plugin === "function" ? plugin() : plugin;
					if (plugin.type === "post-process") {
						if (plugin.async) {
							content = await plugin.func(content, outName);
						} else {
							content = plugin.func(content, outName);
						}
					}
				}
			}
			// ------------------------------------------

			// ---------------------------------------------
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
			await utilities.wait(500);
			if (format !== "commonjs") {
				await utilities.clearFolder(path.dirname(outName));
			}
			await utilities.writeCompileFile(outName, content);
		});
		console.timeEnd(tcolor.green(`Compiled ESM ${_name} output.`));
	}
	async compile() {
		for (const point of this.object.points) {
			await utilities.wait(500);
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
					await utilities.wait(1000);
					await this._commonjs(point);
					if (this._isUpdate()) {
						await writePackage(this.files, point.exportPath);
					}
					break;
			}
			await utilities.wait(500);
		}
	}
}

export default Compiler;
