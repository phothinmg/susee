import { bundler } from "../bundler/index.js";
import type { BuildEntryPoint, BuildOptions } from "../config/index.js";
import { files } from "../helpers/files.js";
import { logProfilePhase } from "../helpers/profile.js";
import { utils } from "../helpers/utilities.js";
import { suseeCompiler } from "./suseeCompiler.js";
import { getCompilerOptions } from "./tsoptions.js";

const logCompilerPhase = (
	entry: string,
	format: "esm" | "commonjs",
	phase: string,
	start: bigint,
) => {
	logProfilePhase(`compiler:${format}:${entry}`, phase, start);
};

/**
 * Compiler for the JavaScript API.
 * It bundles each configured entry point, emits CommonJS and ESM outputs,
 * and optionally updates package export metadata.
 */
class Compiler {
	private _files: files.OutFiles;
	private _object: BuildOptions;
	private _bundledCodeCache: WeakMap<BuildEntryPoint, Promise<string>>;
	/**
	 * Creates a compiler instance with normalized build options.
	 * @param {BuildOptions} object - build options generated from the susee config.
	 */
	constructor(object: BuildOptions) {
		this._object = object;
		this._bundledCodeCache = new WeakMap();
		this._files = {
			commonjs: undefined,
			commonjsTypes: undefined,
			esm: undefined,
			esmTypes: undefined,
			main: undefined,
			module: undefined,
			types: undefined,
		};
	}
	private _update() {
		return this._object.updatePackage;
	}
	private async _bundle(point: BuildEntryPoint) {
		let bundledCode = this._bundledCodeCache.get(point);
		if (!bundledCode) {
			bundledCode = bundler(
				point.entry,
				point.plugins,
				point.warning,
				point.rename,
			);
			this._bundledCodeCache.set(point, bundledCode);
		}
		return bundledCode;
	}
	private async _commonjs(point: BuildEntryPoint) {
		const isMain = point.exportPath === ".";
		const opts = getCompilerOptions(point.tsconfigFilePath);
		const compilerOptions = opts.commonjs(point.outputDirectoryPath);
		let phaseStart = process.hrtime.bigint();
		const bundledCode = await this._bundle(point);
		logCompilerPhase(point.entry, "commonjs", "bundle", phaseStart);
		const is_jsx = utils.checks.isJsxContent(bundledCode);
		phaseStart = process.hrtime.bigint();
		const compiled = suseeCompiler({
			sourceCode: bundledCode,
			fileName: point.entry,
			compilerOptions,
			isJsx: is_jsx,
		});
		logCompilerPhase(point.entry, "commonjs", "typescriptEmit", phaseStart);
		let compiledCode = compiled.code;
		const mainFilePath = files.joinPath(
			compiled.out_dir,
			`${compiled.file_name}.cjs`,
		);
		const dtsFilePath = files.joinPath(
			compiled.out_dir,
			`${compiled.file_name}.d.cts`,
		);
		const mapFilePath = files.joinPath(
			compiled.out_dir,
			`${compiled.file_name}.cjs.map`,
		);
		// replace source mapping url
		compiledCode = compiledCode.replace(
			new RegExp(`${compiled.file_name}.js.map`, "gm"),
			`${compiled.file_name}.cjs.map`,
		);
		// call post-process plugin
		if (point.plugins.length > 0) {
			for (const plugin of point.plugins) {
				const _plugin = typeof plugin === "function" ? plugin() : plugin;
				if (_plugin.type === "post-process") {
					phaseStart = process.hrtime.bigint();
					if (_plugin.async) {
						compiledCode = await _plugin.func(compiledCode, point.entry);
					} else {
						compiledCode = _plugin.func(compiledCode, point.entry);
					}
					logCompilerPhase(
						point.entry,
						"commonjs",
						`postProcessPlugin:${_plugin.name ?? "anonymous"}`,
						phaseStart,
					);
				}
			}
		}
		// if allow update create file object
		if (this._update()) {
			this._files.commonjs = mainFilePath;
			if (compiled.dts) {
				this._files.commonjsTypes = dtsFilePath;
			}
			if (isMain && point.format.includes("commonjs")) {
				if (this._files.commonjs) this._files.main = this._files.commonjs;
				if (this._files.commonjsTypes)
					this._files.types = this._files.commonjsTypes;
			}
		} //update
		phaseStart = process.hrtime.bigint();
		await files.writeFile(mainFilePath, compiledCode);
		if (compiled.dts) await files.writeFile(dtsFilePath, compiled.dts);
		if (compiled.map) await files.writeFile(mapFilePath, compiled.map);
		logCompilerPhase(point.entry, "commonjs", "writeFiles", phaseStart);
	}
	private async _esm(point: BuildEntryPoint) {
		const isMain = point.exportPath === ".";
		const opts = getCompilerOptions(point.tsconfigFilePath);
		const compilerOptions = opts.esm(point.outputDirectoryPath);
		let phaseStart = process.hrtime.bigint();
		const bundledCode = await this._bundle(point);
		logCompilerPhase(point.entry, "esm", "bundle", phaseStart);
		const is_jsx = utils.checks.isJsxContent(bundledCode);
		phaseStart = process.hrtime.bigint();
		const compiled = suseeCompiler({
			sourceCode: bundledCode,
			fileName: point.entry,
			compilerOptions,
			isJsx: is_jsx,
		});
		logCompilerPhase(point.entry, "esm", "typescriptEmit", phaseStart);
		let compiledCode = compiled.code;
		const mainFilePath = files.joinPath(
			compiled.out_dir,
			`${compiled.file_name}.mjs`,
		);
		const dtsFilePath = files.joinPath(
			compiled.out_dir,
			`${compiled.file_name}.d.mts`,
		);
		const mapFilePath = files.joinPath(
			compiled.out_dir,
			`${compiled.file_name}.mjs.map`,
		);
		// replace source mapping url
		compiledCode = compiledCode.replace(
			new RegExp(`${compiled.file_name}.js.map`, "gm"),
			`${compiled.file_name}.mjs.map`,
		);
		// call post-process plugin
		if (point.plugins.length > 0) {
			for (const plugin of point.plugins) {
				const _plugin = typeof plugin === "function" ? plugin() : plugin;
				if (_plugin.type === "post-process") {
					phaseStart = process.hrtime.bigint();
					if (_plugin.async) {
						compiledCode = await _plugin.func(compiledCode, point.entry);
					} else {
						compiledCode = _plugin.func(compiledCode, point.entry);
					}
					logCompilerPhase(
						point.entry,
						"esm",
						`postProcessPlugin:${_plugin.name ?? "anonymous"}`,
						phaseStart,
					);
				}
			}
		}
		if (this._update()) {
			this._files.esm = mainFilePath;
			if (compiled.dts) {
				this._files.esmTypes = dtsFilePath;
			}
			if (isMain && this._files.esm) {
				this._files.module = this._files.esm;
			}
		} //update
		phaseStart = process.hrtime.bigint();
		await files.writeFile(mainFilePath, compiledCode);
		if (compiled.dts) await files.writeFile(dtsFilePath, compiled.dts);
		if (compiled.map) await files.writeFile(mapFilePath, compiled.map);
		logCompilerPhase(point.entry, "esm", "writeFiles", phaseStart);
	}
	/**
	 * Clears the output directory and compiles all configured entry points.
	 * It also updates package.json export fields when package updates are enabled.
	 * @returns {Promise<void>}
	 */
	async compile(): Promise<void> {
		await files.clearFolder(this._object.outDir);
		for (const point of this._object.buildEntryPoints) {
			for (const format of point.format) {
				switch (format) {
					case "commonjs":
						await this._commonjs(point);
						if (this._update()) {
							await files.writePackageJson(this._files, point.exportPath);
						}
						break;
					case "esm":
						await this._esm(point);
						if (this._update()) {
							await files.writePackageJson(this._files, point.exportPath);
						}
						break;
				}
			}
		}
	}
}

export { Compiler };
