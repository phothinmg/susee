import suseeTerser from "susee-plugin-terser";
import type { OutputFormat, Point, FinalSuseeConfig } from "./suseeConfig.js";

function finalCliConfig(
  _entry: string,
  _format?: "cjs" | "esm",
  outDir?: string,
  tsconfig?: string,
  rename?: boolean,
  allowUpdate?: boolean,
  minify?: boolean,
): FinalSuseeConfig {
  const out_dir = outDir ?? "dist";
  const point: Point = {
    entry: _entry,
    format: _format ? ([_format] as OutputFormat) : ["esm"],
    exportPath: ".",
    tsconfigFilePath: tsconfig ?? undefined,
    renameDuplicates: rename ?? true,
    outDirPath: out_dir,
  };
  const final: FinalSuseeConfig = {
    points: [point],
    plugins: minify ? [suseeTerser()] : [],
    allowUpdatePackageJson: allowUpdate ?? false,
    outDir: out_dir,
  };
  return final;
}

export { finalCliConfig };
