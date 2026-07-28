import { bundler } from "./bundler/index.js";
import { files } from "./files.js";
import { suseeCompiler, typeCheckSuseeCompiler } from "./suseeCompiler.js";
import type { BuildEntryPoint, BuildOptions } from "./suseeConfig.js";
import { getCompilerOptions } from "./tsoptions.js";
import { utils } from "./utilities.js";

type PreparedBundle = {
	bundledCode: string;
	isJsx: boolean;
	compilerOptions: ReturnType<typeof getCompilerOptions>;
};

/**
 * Compiler for the JavaScript API.
 * It bundles each configured entry point, emits CommonJS and ESM outputs,
 * and optionally updates package export metadata.
 */
class Compiler {
	private _files: files.OutFiles;
	private _object: BuildOptions;
	/**
	 * Creates a compiler instance with normalized build options.
	 * @param {BuildOptions} object - build options generated from the susee config.
	 */
	constructor(object: BuildOptions) {
		this._object = object;
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
	private async _prepareBundle(point: BuildEntryPoint): Promise<PreparedBundle> {
		const bundledCode = await bundler(
			point.entry,
			point.plugins,
			point.warning,
			point.rename,
		);
		const compilerOptions = getCompilerOptions(point.tsconfigFilePath);
		const isJsx = utils.checks.isJsxContent(bundledCode);
		const typeCheckOptions = point.format.includes("esm")
			? compilerOptions.esm(point.outputDirectoryPath)
			: compilerOptions.commonjs(point.outputDirectoryPath);
		typeCheckSuseeCompiler({
			sourceCode: bundledCode,
			fileName: point.entry,
			compilerOptions: typeCheckOptions,
			isJsx,
		});
		return { bundledCode, isJsx, compilerOptions };
	}
	private async _commonjs(point: BuildEntryPoint, prepared: PreparedBundle) {
		const isMain = point.exportPath === ".";
		const compilerOptions = prepared.compilerOptions.commonjs(
			point.outputDirectoryPath,
		);
		const compiled = suseeCompiler({
			sourceCode: prepared.bundledCode,
			fileName: point.entry,
			compilerOptions,
			isJsx: prepared.isJsx,
		});
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
					if (_plugin.async) {
						compiledCode = await _plugin.func(compiledCode, point.entry);
					} else {
						compiledCode = _plugin.func(compiledCode, point.entry);
					}
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
		await files.writeFile(mainFilePath, compiledCode);
		if (compiled.dts) await files.writeFile(dtsFilePath, compiled.dts);
		if (compiled.map) await files.writeFile(mapFilePath, compiled.map);
	}
	private async _esm(point: BuildEntryPoint, prepared: PreparedBundle) {
		const isMain = point.exportPath === ".";
		const compilerOptions = prepared.compilerOptions.esm(
			point.outputDirectoryPath,
		);
		const compiled = suseeCompiler({
			sourceCode: prepared.bundledCode,
			fileName: point.entry,
			compilerOptions,
			isJsx: prepared.isJsx,
		});
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
					if (_plugin.async) {
						compiledCode = await _plugin.func(compiledCode, point.entry);
					} else {
						compiledCode = _plugin.func(compiledCode, point.entry);
					}
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
		await files.writeFile(mainFilePath, compiledCode);
		if (compiled.dts) await files.writeFile(dtsFilePath, compiled.dts);
		if (compiled.map) await files.writeFile(mapFilePath, compiled.map);
	}
	/**
	 * Clears the output directory and compiles all configured entry points.
	 * It also updates package.json export fields when package updates are enabled.
	 * @returns {Promise<void>}
	 */
	async compile(): Promise<void> {
		await files.clearFolder(this._object.outDir);
		for (const point of this._object.buildEntryPoints) {
			const prepared = await this._prepareBundle(point);
			for (const format of point.format) {
				switch (format) {
					case "commonjs":
						await this._commonjs(point, prepared);
						if (this._update()) {
							files.writePackageJson(this._files, point.exportPath);
						}
						break;
					case "esm":
						await this._esm(point, prepared);
						if (this._update()) {
							files.writePackageJson(this._files, point.exportPath);
						}
						break;
				}
			}
		}
	}
}

export { Compiler };
