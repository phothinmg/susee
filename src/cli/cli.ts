import { suseeTerser } from "@suseejs/terser-plugin";
import { bundler } from "../bundler/index.js";
import { suseeCompiler } from "../compiler/suseeCompiler.js";
import { getCompilerOptions } from "../compiler/tsoptions.js";
import { files } from "../helpers/files.js";
import { logProfilePhase } from "../helpers/profile.js";
import { utils } from "../helpers/utilities.js";
import type { CliBuildOptions } from "./lib/parse_argv.js";

const logCliCompilerPhase = (
	entry: string,
	format: "esm" | "commonjs",
	phase: string,
	start: bigint,
) => {
	logProfilePhase(`compiler:${format}:${entry}`, phase, start);
};

class CliCompiler {
	private _files: files.OutFiles;
	private _update: boolean;
	constructor() {
		this._files = {
			commonjs: undefined,
			commonjsTypes: undefined,
			esm: undefined,
			esmTypes: undefined,
			main: undefined,
			module: undefined,
			types: undefined,
		};
		this._update = false;
	}
	private async _commonjs(opts: CliBuildOptions) {
		this._update = opts.allowUpdate;
		const _opts = getCompilerOptions(opts.tsconfig);
		const compilerOptions = _opts.commonjs(opts.outDir);
		let phaseStart = process.hrtime.bigint();
		const bundledCode = await bundler(opts.entry, opts.plugins, opts.warning);
		logCliCompilerPhase(opts.entry, "commonjs", "bundle", phaseStart);
		const is_jsx = utils.checks.isJsxContent(bundledCode);
		phaseStart = process.hrtime.bigint();
		const compiled = suseeCompiler({
			sourceCode: bundledCode,
			fileName: opts.entry,
			compilerOptions,
			isJsx: is_jsx,
		});
		logCliCompilerPhase(opts.entry, "commonjs", "typescriptEmit", phaseStart);
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
		compiledCode = compiledCode.replace(
			new RegExp(`${compiled.file_name}.js.map`, "gm"),
			`${compiled.file_name}.cjs.map`,
		);
		// --
		if (opts.minify) {
			opts.plugins = [suseeTerser, ...opts.plugins];
			opts.plugins = [...new Set(opts.plugins)];
		}
		// call post-process plugin
		if (opts.plugins.length > 0) {
			for (const plugin of opts.plugins) {
				const _plugin = typeof plugin === "function" ? plugin() : plugin;
				if (_plugin.type === "post-process") {
					phaseStart = process.hrtime.bigint();
					if (_plugin.async) {
						compiledCode = await _plugin.func(compiledCode, opts.entry);
					} else {
						compiledCode = _plugin.func(compiledCode, opts.entry);
					}
					logCliCompilerPhase(
						opts.entry,
						"commonjs",
						`postProcessPlugin:${_plugin.name ?? "anonymous"}`,
						phaseStart,
					);
				}
			}
		} //-----------
		if (this._update) {
			this._files.commonjs = mainFilePath;
			if (compiled.dts) {
				this._files.commonjsTypes = dtsFilePath;
			}
			if (opts.format.includes("commonjs")) {
				if (this._files.commonjs) this._files.main = this._files.commonjs;
				if (this._files.commonjsTypes)
					this._files.types = this._files.commonjsTypes;
			}
		} //update
		phaseStart = process.hrtime.bigint();
		await files.writeFile(mainFilePath, compiledCode);
		if (compiled.dts) await files.writeFile(dtsFilePath, compiled.dts);
		if (compiled.map) await files.writeFile(mapFilePath, compiled.map);
		logCliCompilerPhase(opts.entry, "commonjs", "writeFiles", phaseStart);
	}
	//-----------------------------------------------------------------//
	private async _esm(opts: CliBuildOptions) {
		this._update = opts.allowUpdate;
		const _opts = getCompilerOptions(opts.tsconfig);
		const compilerOptions = _opts.esm(opts.outDir);
		let phaseStart = process.hrtime.bigint();
		const bundledCode = await bundler(opts.entry, opts.plugins, opts.warning);
		logCliCompilerPhase(opts.entry, "esm", "bundle", phaseStart);
		const is_jsx = utils.checks.isJsxContent(bundledCode);
		phaseStart = process.hrtime.bigint();
		const compiled = suseeCompiler({
			sourceCode: bundledCode,
			fileName: opts.entry,
			compilerOptions,
			isJsx: is_jsx,
		});
		logCliCompilerPhase(opts.entry, "esm", "typescriptEmit", phaseStart);
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
		compiledCode = compiledCode.replace(
			new RegExp(`${compiled.file_name}.js.map`, "gm"),
			`${compiled.file_name}.mjs.map`,
		);
		if (opts.minify) {
			opts.plugins = [suseeTerser, ...opts.plugins];
			opts.plugins = [...new Set(opts.plugins)];
		}
		// call post-process plugin
		if (opts.plugins.length > 0) {
			for (const plugin of opts.plugins) {
				const _plugin = typeof plugin === "function" ? plugin() : plugin;
				if (_plugin.type === "post-process") {
					phaseStart = process.hrtime.bigint();
					if (_plugin.async) {
						compiledCode = await _plugin.func(compiledCode, opts.entry);
					} else {
						compiledCode = _plugin.func(compiledCode, opts.entry);
					}
					logCliCompilerPhase(
						opts.entry,
						"esm",
						`postProcessPlugin:${_plugin.name ?? "anonymous"}`,
						phaseStart,
					);
				}
			}
		} //-----------
		if (this._update) {
			this._files.esm = mainFilePath;
			if (compiled.dts) {
				this._files.esmTypes = dtsFilePath;
			}
			if (this._files.esm) {
				this._files.module = this._files.esm;
			}
		} //update
		phaseStart = process.hrtime.bigint();
		await files.writeFile(mainFilePath, compiledCode);
		if (compiled.dts) await files.writeFile(dtsFilePath, compiled.dts);
		if (compiled.map) await files.writeFile(mapFilePath, compiled.map);
		logCliCompilerPhase(opts.entry, "esm", "writeFiles", phaseStart);
	}
	//--
	async compile(opts: CliBuildOptions) {
		await files.clearFolder(opts.outDir);
		switch (opts.format) {
			case "commonjs":
				await this._commonjs(opts);
				if (this._update) {
					await files.writePackageJson(this._files, ".");
				}
				break;
			case "esm":
				await this._esm(opts);
				if (this._update) {
					await files.writePackageJson(this._files, ".");
				}
				break;
		}
	}
}

export const cliCompiler = new CliCompiler();
