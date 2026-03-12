import tcolor from "@suseejs/tcolor";
import ts from "typescript";
import type {
  DependenciesFiles,
  SuseePlugin,
  SuseePluginFunction,
} from "../types.js";
import compilerOptions from "./compilerOptions.js";
import generateDependencies from "./dependencies.js";
import finalSuseeConfig from "./suseeConfig.js";
import typeCheck from "./typeCheck.js";

export interface InitializePoint {
  fileName: string;
  exportPath: "." | `./${string}`;
  format: "commonjs" | "esm" | "both";
  rename: boolean;
  outDir: string;
  tsOptions: {
    cjs: ts.CompilerOptions;
    esm: ts.CompilerOptions;
    default: ts.CompilerOptions;
  };
  depFiles: DependenciesFiles;
  plugins: (SuseePlugin | SuseePluginFunction)[];
}

export interface InitializeResult {
  points: InitializePoint[];
  allowUpdatePackageJson: boolean;
}

/**
 * This function is the main entry point for susee.
 */
async function initializer(): Promise<InitializeResult> {
  console.time(`${tcolor.cyan("Collected Data")}`);
  const __config = await finalSuseeConfig();
  const points = __config.points;
  const plugins = __config.plugins;
  const result: InitializePoint[] = [];
  for (const point of points) {
    const __opts = compilerOptions(point);
    let __deps = await generateDependencies(point.entry);
    const typeChecked = await typeCheck(__deps, __opts.esm);
    if (!typeChecked) {
      ts.sys.exit(1);
    }
    // call dependency plugins
    if (plugins.length) {
      for (const plugin of plugins) {
        const _plugin = typeof plugin === "function" ? plugin() : plugin;
        if (_plugin.type === "dependency") {
          if (_plugin.async) {
            __deps = await Promise.all(
              __deps.map(async (d) => await _plugin.func(d, __opts.default)),
            );
          } else {
            __deps = __deps.map((d) => _plugin.func(d, __opts.default));
          }
        }
      }
    }

    const c = {
      fileName: point.entry,
      exportPath: point.exportPath,
      format: point.format,
      rename: point.renameDuplicates,
      outDir: point.outDirPath,
      tsOptions: {
        cjs: __opts.commonjs,
        esm: __opts.esm,
        default: __opts.default,
      },
      depFiles: __deps,
      plugins: plugins,
    } as InitializePoint;
    result.push(c);
  }
  console.timeEnd(`${tcolor.cyan("Collected Data")}`);
  return {
    points: result,
    allowUpdatePackageJson: __config.allowUpdatePackageJson,
  } as InitializeResult;
}

export default initializer;
