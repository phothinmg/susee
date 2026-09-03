import type { BuildEntryPoint, BuildOptions } from "../config/index.js";
import { files } from "../helpers/files.js";
//import { utils } from "../helpers/utilities.js";
import { suseeCompiler } from "./suseeCompiler.js";
import { getCompilerOptions } from "./tsoptions.js";
import { bundler } from "../bundler.js";
import { oxcMinify } from "../helpers/minify.js";
import ts6 from "@suseejs/ts6";

/**
 * Checks if the given code string contains JSX syntax.
 * @param code The content of the file as a string.
 * @returns true if the file contains JSX, false otherwise.
 */
function isJsxContent(code: string): boolean {
  const sourceFile = ts6.createSourceFile(
    "file.tsx",
    code,
    ts6.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts6.ScriptKind.TSX,
  );

  let containsJsx = false;

  function visitor(node: ts6.Node) {
    // Check for JSX Elements, Self Closing Elements, or JSX Fragments
    if (
      ts6.isJsxElement(node) ||
      ts6.isJsxSelfClosingElement(node) ||
      ts6.isJsxFragment(node)
    ) {
      containsJsx = true;
      return;
    }
    ts6.forEachChild(node, visitor);
  }

  visitor(sourceFile);

  return containsJsx;
}

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
  private async _commonjs(point: BuildEntryPoint, bundledCode: string) {
    const isMain = point.exportPath === ".";
    const opts = getCompilerOptions(point.tsconfigFilePath);
    const compilerOptions = opts.commonjs(point.outputDirectoryPath);
    const is_jsx = isJsxContent(bundledCode);
    const compiled = suseeCompiler({
      sourceCode: bundledCode,
      fileName: point.entry,
      compilerOptions,
      isJsx: is_jsx,
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
    if (point.minify) {
      compiledCode = await oxcMinify(
        `${compiled.file_name}.cjs`,
        compiledCode,
        point,
      );
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
  private async _esm(point: BuildEntryPoint, bundledCode: string) {
    const isMain = point.exportPath === ".";
    const opts = getCompilerOptions(point.tsconfigFilePath);
    const compilerOptions = opts.esm(point.outputDirectoryPath);
    const is_jsx = isJsxContent(bundledCode);
    const compiled = suseeCompiler({
      sourceCode: bundledCode,
      fileName: point.entry,
      compilerOptions,
      isJsx: is_jsx,
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
    if (point.minify) {
      compiledCode = await oxcMinify(
        `${compiled.file_name}.mjs`,
        compiledCode,
        point,
      );
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
      const bundleCode = bundler(point);
      for (const format of point.format) {
        switch (format) {
          case "commonjs":
            await this._commonjs(point, bundleCode);
            if (this._update()) {
              await files.writePackageJson(this._files, point.exportPath);
            }
            break;
          case "esm":
            await this._esm(point, bundleCode);
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
