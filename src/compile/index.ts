import ts from "typescript";
import path from "node:path";
import tcolor from "@suseejs/tcolor";
import utilities from "../utils.js";
import createHost from "./host.js";
import type { BundleResult, OutFiles } from "../types_def.js";

class Compiler {
  public files: OutFiles;
  private object: BundleResult;
  constructor(object: BundleResult) {
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
    let r = false;
    if (this.object.outputTarget === "nodejs") {
      if (this.object.allowUpdatePackageJson) {
        r = this.object.allowUpdatePackageJson;
      } else {
        r = true;
      }
    }
    return r;
  }
  async commonjs() {
    console.time(tcolor.green("Compiled Commonjs"));
    // init
    const fileName = this.object.entryFileName;
    const sourceCode = this.object.bundleContent;
    const format = this.object.outputFormat;
    const target = this.object.outputTarget;
    const plugins = this.object.plugins;
    const compilerOptions = this.object.tsOptions.commonJsCompilerOptions();
    const isMain =
      this.object.outputTarget === "nodejs" && this.object.exportPath === ".";
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
      if (this.object.outputTarget === "nodejs" && this._isUpdate()) {
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
      if (target === "nodejs") {
        if (format === "commonjs") {
          await utilities.clearFolder(path.dirname(outName));
        }
      }
      await utilities.writeCompileFile(outName, content);
    });
    console.timeEnd(tcolor.green("Compiled Commonjs"));
  }
  async esm() {
    console.time(tcolor.green("Compiled ESM"));
    // init
    const fileName = this.object.entryFileName;
    const sourceCode = this.object.bundleContent;
    const format = this.object.outputFormat;
    const target = this.object.outputTarget;
    const plugins = this.object.plugins;
    //
    const compilerOptions = this.object.tsOptions.esmCompilerOptions();
    const isMain =
      this.object.outputTarget === "nodejs" && this.object.exportPath === ".";

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
      if (target === "nodejs" && this._isUpdate()) {
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
      if (target === "nodejs") {
        if (format !== "commonjs") {
          await utilities.clearFolder(path.dirname(outName));
        }
      }
      await utilities.writeCompileFile(outName, content);
    });
    console.timeEnd(tcolor.green("Compiled ESM"));
  }
}

export default Compiler;
