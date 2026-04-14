import path from "node:path";
import tcolor from "../utils/tcolor.js";
import type { BundledResult, BundlePoint, OutFiles } from "susee-types";
import ts from "typescript";
import { files } from "../utils/files.js";
import { createHost } from "./host.js";

const resolveSourceMappingURL = (
	outName: string,
	content: string,
	format: "cjs" | "esm",
) => {
	const ext = path.extname(outName);
	// create file name regexp
	const file_name = path.basename(outName).split(".")[0] as string;
	const fileNameRegexp = new RegExp(`${file_name}.js.map`, "gm");
	const dtsFileNameRegexp = new RegExp(`${file_name}.d.ts.map`, "gm");
	const replaceName =
		format === "cjs" ? `${file_name}.cjs.map` : `${file_name}.mjs.map`;
	const dtsReplaceName =
		format === "cjs"
			? `${file_name}.d.cts.map`
			: format === "esm"
				? `${file_name}.d.mts.map`
				: "";
	return ext === ".js"
		? content.replace(fileNameRegexp, replaceName)
		: content.replace(dtsFileNameRegexp, dtsReplaceName);
};

const postProcessPluginParser = async (
	plugins: BundlePoint["plugins"],
	content: string,
	outName: string,
) => {
	const ext = path.extname(outName);
	if (ext === ".js") {
		if (plugins.length) {
			for (let plugin of plugins) {
				plugin = typeof plugin === "function" ? plugin() : plugin;
				if (
					plugin.type === "post-process" &&
					!(plugin?.name === "@suseejs/plugin-browser")
				) {
					if (plugin.async) {
						content = await plugin.func(content, outName);
					} else {
						content = plugin.func(content, outName);
					}
				}
			}
		}
	}
	return content;
};

// Compiler Class
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
	//Compiler output state was reused across export points
	// Added per-point state reset
	private _resetPointFiles() {
		this.files.commonjs = undefined;
		this.files.commonjsTypes = undefined;
		this.files.esm = undefined;
		this.files.esmTypes = undefined;
	}
	private _isUpdate() {
		return this.object.allowUpdatePackageJson;
	}
	/**
	 * Compiles a single file into a CommonJS module.
	 * @param point - a point containing the file name, source code, format, and plugins.
	 * @returns A promise that resolves when the compilation is complete.
	 */
	private async _commonjs(point: BundlePoint) {
		const isMain = point.exportPath === ".";
		console.time(
			`    ${tcolor.cyan(`Compiled commonjs`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
		);
		// init
		const fileName = point.fileName;
		const sourceCode = point.bundledContent;
		const format = [...new Set(point.format)];
		const compilerOptions = point.tsOptions.cjs;
		// create host
		const _host = createHost(sourceCode, fileName);
		const createdFiles: Record<string, string> = _host.createdFiles;
		const host = _host.host;
		const program = ts.createProgram([fileName], compilerOptions, host);
		program.emit();
		Object.entries(createdFiles).map(async ([outName, content]) => {
			content = await postProcessPluginParser(point.plugins, content, outName);
			content = resolveSourceMappingURL(outName, content, "cjs");

			//----------------------------------------------------------------

			if (this._isUpdate()) {
				if (outName.match(/.js/g)) {
					this.files.commonjs = outName.replace(/.js/g, ".cjs");
				}
				if (outName.match(/.d.ts/g)) {
					this.files.commonjsTypes = outName.replace(/.d.ts/g, ".d.cts");
				}

				if (isMain && format.includes("commonjs")) {
					if (this.files.commonjs) this.files.main = this.files.commonjs;
					if (this.files.commonjsTypes)
						this.files.types = this.files.commonjsTypes;
				}
			}

			outName = outName.replace(/.js/g, ".cjs");
			outName = outName.replace(/.map.js/g, ".map.cjs");
			outName = outName.replace(/.d.ts/g, ".d.cts");
			await files.writeFile(outName, content);
		});
		console.timeEnd(
			`    ${tcolor.cyan(`Compiled commonjs`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
		);
	}
	/**
	 * Compiles a single file into an ESM module.
	 * @param point - a point containing the file name, source code, format, and plugins.
	 * @returns A promise that resolves when the compilation is complete.
	 */
	private async _esm(point: BundlePoint) {
		const isMain = point.exportPath === ".";
		console.time(
			`    ${tcolor.cyan(`Compiled esm`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
		);
		// init
		const fileName = point.fileName;
		const sourceCode = point.bundledContent;
		const compilerOptions = point.tsOptions.esm;
		// create host
		const _host = createHost(sourceCode, fileName);
		const createdFiles: Record<string, string> = _host.createdFiles;
		const host = _host.host;
		const program = ts.createProgram([fileName], compilerOptions, host);
		program.emit();
		Object.entries(createdFiles).map(async ([outName, content]) => {
			content = resolveSourceMappingURL(outName, content, "esm");
			content = await postProcessPluginParser(point.plugins, content, outName);
			//----------------------------------------------------------------

			if (this._isUpdate()) {
				if (outName.match(/.js/g)) {
					this.files.esm = outName.replace(/.js/g, ".mjs");
				}
				if (outName.match(/.d.ts/g)) {
					this.files.esmTypes = outName.replace(/.d.ts/g, ".d.mts");
				}
				if (isMain && this.files.esm) {
					this.files.module = this.files.esm;
				}
			}

			outName = outName.replace(/.js/g, ".mjs");
			outName = outName.replace(/.map.js/g, ".map.mjs");
			outName = outName.replace(/.d.ts/g, ".d.mts");
			await files.writeFile(outName, content);
		});
		console.timeEnd(
			`    ${tcolor.cyan(`Compiled esm`)} -> ${tcolor.cyan(`export path(${tcolor.magenta(`"${point.exportPath}"`)})`)} `,
		);
	}

	async compile() {
		for (const point of this.object.points) {
			// Called it before each point compilation
			this._resetPointFiles();
			await files.clearFolder(point.outDir);
			const formats = point.format;
			for (const format of formats) {
				switch (format) {
					case "commonjs":
						await this._commonjs(point);
						if (this._isUpdate()) {
							await files.writePackage(this.files, point.exportPath);
						}
						break;
					case "esm":
						await this._esm(point);
						if (this._isUpdate()) {
							await files.writePackage(this.files, point.exportPath);
						}
						break;
				}
			}
		}
	}
}

export { Compiler };
