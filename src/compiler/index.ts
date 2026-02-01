import ts from "typescript";
import utils from "@suseejs/utils";
import type SuSee from "@suseejs/types";
import createHost from "./host.js";
import getCompilerOptions from "./getOptions.js";
import { replaceInJs, replaceInTs } from "./replacecjs.js";
import { writeCompileFile } from "./write.js";
import checkExports from "./checkExports.js";

type CompilerOptions = {
  target?: SuSee.Target;
  configPath?: string | undefined;
};

class Compilers {
  files: SuSee.OutFiles;
  private _target: SuSee.Target;
  private _configPath: string | undefined;

  constructor(options?: CompilerOptions) {
    this._target = options?.target ?? "both";
    this._configPath = options?.configPath;
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
  async commonjs(
    sourceCode: string,
    fileName: string,
    exportPath: "." | `./${string}`,
    hooks?: SuSee.PostProcessHook[],
    isUpdate = true,
  ) {
    console.time("Compiled Commonjs");
    const ck = checkExports(fileName, sourceCode);
    if (ck.defExport && ck.nameExport) {
      console.warn(
        "Both name export and default export are exported from your project,that will effect on default export for commonjs output",
      );
    }
    // get options
    const config = getCompilerOptions(exportPath, this._configPath).commonjs();
    const compilerOptions: ts.CompilerOptions = config.compilerOptions;
    const isMain = config.isMain;
    // create host
    const _host = createHost(sourceCode, fileName);
    const createdFiles: Record<string, string> = _host.createdFiles;
    const host = _host.host;
    const program = ts.createProgram([fileName], compilerOptions, host);
    program.emit();
    Object.entries(createdFiles).map(async ([outName, content]) => {
      if (ck.defExport && !ck.nameExport) {
        const ext = utils.extname(outName);
        if (ext === ".js") {
          content = replaceInJs(fileName, content, compilerOptions);
        }
        if (ext === ".ts") {
          content = replaceInTs(fileName, content, compilerOptions);
        }
      }
      if (hooks?.length) {
        for (const hook of hooks) {
          if (hook.async) {
            content = await hook.func(content, outName);
          } else {
            content = hook.func(content, outName);
          }
        }
      }
      if (isUpdate) {
        if (outName.match(/.js/g)) {
          this.files.commonjs = outName.replace(/.js/g, ".cjs");
        }
        if (outName.match(/.d.ts/g)) {
          this.files.commonjsTypes = outName.replace(/.d.ts/g, ".d.cts");
        }

        if (
          isMain &&
          (this._target === "both" || this._target === "commonjs")
        ) {
          if (this.files.commonjs) this.files.main = this.files.commonjs;
          if (this.files.commonjsTypes)
            this.files.types = this.files.commonjsTypes;
        }
      }

      outName = outName.replace(/.js/g, ".cjs");
      outName = outName.replace(/.map.js/g, ".map.cjs");
      outName = outName.replace(/.d.ts/g, ".d.cts");
      await utils.wait(500);
      await writeCompileFile(outName, content);
    });
    console.timeEnd("Compiled Commonjs");
  }
  async esm(
    sourceCode: string,
    fileName: string,
    exportPath: "." | `./${string}`,
    hooks?: SuSee.PostProcessHook[],
    isUpdate = true,
  ) {
    console.time("Compiled ESM");
    // get options
    const config = getCompilerOptions(exportPath, this._configPath).esm();
    const compilerOptions: ts.CompilerOptions = config.compilerOptions;
    const isMain = config.isMain;
    // create host
    const _host = createHost(sourceCode, fileName);
    const createdFiles: Record<string, string> = _host.createdFiles;
    const host = _host.host;
    const program = ts.createProgram([fileName], compilerOptions, host);
    program.emit();
    Object.entries(createdFiles).map(async ([outName, content]) => {
      if (hooks?.length) {
        for (const hook of hooks) {
          if (hook.async) {
            content = await hook.func(content, outName);
          } else {
            content = hook.func(content, outName);
          }
        }
      }
      if (isUpdate) {
        if (outName.match(/.js/g)) {
          this.files.esm = outName.replace(/.js/g, ".mjs");
        }
        if (outName.match(/.d.ts/g)) {
          this.files.esmTypes = outName.replace(/.d.ts/g, ".d.mts");
        }
        if (isMain && this._target === "both" && this.files.esm) {
          this.files.module = this.files.esm;
        }
      }

      outName = outName.replace(/.js/g, ".mjs");
      outName = outName.replace(/.map.js/g, ".map.mjs");
      outName = outName.replace(/.d.ts/g, ".d.mts");
      await utils.wait(500);
      await writeCompileFile(outName, content);
    });
    console.timeEnd("Compiled ESM");
  }
}
export default Compilers;
