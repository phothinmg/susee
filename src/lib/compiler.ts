import { bundler } from "@suseejs/bundler";
import { suseeCompiler } from "@suseejs/compiler";
import { getCompilerOptions } from "@suseejs/tsoptions";
import type { BuildEntryPoint, BuildOptions } from "./suseeConfig.js";
import { files } from "@suseejs/files";

class Compiler {
  private _files: files.OutFiles;
  private _object: BuildOptions;
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
  private async _commonjs(point: BuildEntryPoint) {
    const isMain = point.exportPath === ".";
    const opts = getCompilerOptions();
    const compilerOptions = opts.commonjs(point.outputDirectoryPath);
    const bundledCode = await bundler(
      point.entry,
      point.plugins,
      point.warning,
      point.rename,
    );
    const compiled = suseeCompiler({
      sourceCode: bundledCode,
      fileName: point.entry,
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
  private async _esm(point: BuildEntryPoint) {
    const isMain = point.exportPath === ".";
    const opts = getCompilerOptions();
    const compilerOptions = opts.esm(point.outputDirectoryPath);
    const bundledCode = await bundler(
      point.entry,
      point.plugins,
      point.warning,
      point.rename,
    );
    const compiled = suseeCompiler({
      sourceCode: bundledCode,
      fileName: point.entry,
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
  async compile() {
    await files.clearFolder(this._object.outDir);
    for (const point of this._object.buildEntryPoints) {
      for (const format of point.format) {
        switch (format) {
          case "commonjs":
            await this._commonjs(point);
            if (this._update()) {
              files.writePackageJson(this._files, point.exportPath);
            }
            break;
          case "esm":
            await this._esm(point);
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
