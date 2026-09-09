import {
  suseeBundler,
  logWarning,
  type CheckOptions,
} from "@suseejs/susee_bundler";
import type { BuildEntryPoint } from "./config/index.js";
import path from "node:path";
import fs from "node:fs";

export interface CliBundleOpts {
  entry: string;
  outDir?: string | undefined;
  check?: CheckOptions | undefined;
}

export function bundler(point: BuildEntryPoint) {
  const root = process.cwd();
  const bundled = suseeBundler(point.entry, root, point.checks);
  if (bundled.moduleType === 2) {
    logWarning(
      "Your project contains CJS files that were auto-converted. Consider migrating to ESM for better tree-shaking.",
    );
  }
  return bundled.bundledCode;
}
export function suseeBundle(entry: string, checkOptions?: CheckOptions) {
  const root = process.cwd();
  const opts: CheckOptions = checkOptions
    ? checkOptions
    : {
        checkAnonymous: false,
        checkDefaultExports: false,
        checkNpmInstalled: false,
      };
  const bundled = suseeBundler(entry, root, opts);
  if (bundled.moduleType === 2) {
    logWarning(
      "Your project contains CJS files that were auto-converted. Consider migrating to ESM for better tree-shaking.",
    );
  }
  return bundled.bundledCode;
}

export async function suseeCliBundle(opts: CliBundleOpts) {
  const fileName = path.basename(opts.entry);
  const outDir = opts.outDir
    ? path.resolve(process.cwd(), opts.outDir)
    : process.cwd();
  const outFilePath = path.join(outDir, fileName);
  const code = suseeBundle(opts.entry, opts.check);
  if (!fs.existsSync(outDir))
    await fs.promises.mkdir(outDir, { recursive: true });
  await fs.promises.writeFile(outFilePath, code);
}
