import { suseeBundler } from "@suseejs/susee_bundler";
import type { BuildEntryPoint } from "./config/index.js";

export function bundler(point: BuildEntryPoint) {
  const bundledCodeCache: WeakMap<BuildEntryPoint, string> = new WeakMap();
  const root = process.cwd();
  let bundledCode = bundledCodeCache.get(point);
  if (!bundledCode) {
    bundledCode = suseeBundler(point.entry,root,point.checks).bundledCode;
    bundledCodeCache.set(point, bundledCode);
  }
  return bundledCode;
}
