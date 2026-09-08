import { minify } from "oxc-minify";
import type { BuildEntryPoint } from "../config/index.js";

export async function oxcMinify(
  fileName: string,
  code: string,
  point: BuildEntryPoint,
) {
  const options =
    typeof point.minify === "object" && typeof point.minify !== "boolean"
      ? point.minify.options
      : undefined;
  const result = await minify(fileName, code, options);
  return result.code;
  
}
