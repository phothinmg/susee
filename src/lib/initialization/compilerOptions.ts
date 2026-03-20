import TsConfig from "@suseejs/tsconfig";
import ts from "typescript";
import type { Point } from "./suseeConfig.js";

class CompilerOptions {
	private _point: Point;
	private _options: ts.CompilerOptions;
	constructor(point: Point) {
		this._point = point;
		this._options = {};
	}
	private __init() {
		const __opts = new TsConfig(this._point.tsconfigFilePath);
		__opts.removeCompilerOption("rootDir");
		__opts.removeCompilerOption("module");
		__opts.editCompilerOptions({
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			outDir: this._point.outDirPath,
			allowJs: true,
		});
		this._options = __opts.getCompilerOptions();
	}
	private __init2() {
		this.__init();
		let { types, lib, ...restOptions } = this._options;
		// normalize types into an array
		if (types) {
			if (!types.includes("node")) {
				types = ["node", ...types];
			}
		} else {
			types = ["node"];
		}
		if (lib) {
			lib = [...new Set(["ESNext", ...lib])];
		} else {
			lib = ["ESNext"];
		}
		return { types, lib, ...restOptions } as ts.CompilerOptions;
	}
	public get commonjs() {
		const opts = this.__init2();
		const { module, ...rest } = opts;
		return { module: ts.ModuleKind.CommonJS, ...rest } as ts.CompilerOptions;
	}
	public get esm() {
		const opts = this.__init2();
		const { module, ...rest } = opts;
		return { module: ts.ModuleKind.ES2020, ...rest } as ts.CompilerOptions;
	}
	public get default() {
		return this.__init2();
	}
}

/**
 * Returns an instance of CompilerOptions, which provides various methods
 * to generate different sets of compiler options based on the
 * given Point.
 *
 * @param {Point} point - The point to generate compiler options for.
 * @returns {CompilerOptions}
 */
function compilerOptions(point: Point): CompilerOptions {
	return new CompilerOptions(point);
}

export default compilerOptions;
