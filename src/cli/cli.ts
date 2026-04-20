import { bundler } from "@suseejs/bundler";
import { suseeCompiler } from "@suseejs/compiler";
import { files } from "@suseejs/files";
import { suseeTerser } from "@suseejs/terser-plugin";
import { getCompilerOptions } from "@suseejs/tsoptions";
import type { CliBuildOptions } from "./lib/parse_argv.js";

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
		const bundledCode = await bundler(
			opts.entry,
			opts.plugins,
			opts.warning,
			opts.rename,
		);
		const compiled = suseeCompiler({
			sourceCode: bundledCode,
			fileName: opts.entry,
			compilerOptions,
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
					if (_plugin.async) {
						compiledCode = await _plugin.func(compiledCode, opts.entry);
					} else {
						compiledCode = _plugin.func(compiledCode, opts.entry);
					}
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
		await files.writeFile(mainFilePath, compiledCode);
		if (compiled.dts) await files.writeFile(dtsFilePath, compiled.dts);
		if (compiled.map) await files.writeFile(mapFilePath, compiled.map);
	}
	//-----------------------------------------------------------------//
	private async _esm(opts: CliBuildOptions) {
		this._update = opts.allowUpdate;
		const _opts = getCompilerOptions(opts.tsconfig);
		const compilerOptions = _opts.esm(opts.outDir);
		const bundledCode = await bundler(
			opts.entry,
			opts.plugins,
			opts.warning,
			opts.rename,
		);
		const compiled = suseeCompiler({
			sourceCode: bundledCode,
			fileName: opts.entry,
			compilerOptions,
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
					if (_plugin.async) {
						compiledCode = await _plugin.func(compiledCode, opts.entry);
					} else {
						compiledCode = _plugin.func(compiledCode, opts.entry);
					}
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
		await files.writeFile(mainFilePath, compiledCode);
		if (compiled.dts) await files.writeFile(dtsFilePath, compiled.dts);
		if (compiled.map) await files.writeFile(mapFilePath, compiled.map);
	}
	//--
	async compile(opts: CliBuildOptions) {
		await files.clearFolder(opts.outDir);
		switch (opts.format) {
			case "commonjs":
				await this._commonjs(opts);
				if (this._update) {
					files.writePackageJson(this._files, ".");
				}
				break;
			case "esm":
				await this._esm(opts);
				if (this._update) {
					files.writePackageJson(this._files, ".");
				}
				break;
		}
	}
}

export const cliCompiler = new CliCompiler();
