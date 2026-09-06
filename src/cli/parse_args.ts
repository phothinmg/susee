import path from "node:path";
import { logError, type CheckOptions } from "@suseejs/susee_bundler";
import { type SuSeeConfig, type EntryPoint } from "../config/index.js";
import { type CliBundleOpts } from "../bundler.js";

interface CliBuildOptions {
  entry?: string;
  outDir?: string | undefined;
  format?: ("commonjs" | "esm")[] | undefined;
  tsconfig?: string | undefined;
  allowUpdate?: boolean | undefined;
  minify?: boolean | undefined;
  check?: boolean | undefined;
}

interface CliBundleOptions {
  entry?: string;
  outDir?: string | undefined;
  check?: boolean | undefined;
}

function fail(message: string) {
  const info = message;
  const cause = "";
  logError(info, cause, true);
}

function isFile(entry: string) {
  const exts = [".js", ".ts", ".mts", ".mjs", ".cjs", ".cts", ".tsx", ".jsx"];
  return exts.includes(path.extname(entry));
}
function isEmptyObject(entry: any) {
  return (
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    Object.keys(entry).length === 0
  );
}
function parseBooleanFlag(flag: string, value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  fail(`Type of ${flag} must be boolean.`);
}

function parseBundleBool(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  fail(`${value} must be "true" or "false".`);
}

function parseArgs(argv: string[]) {
  const buildOpts: CliBuildOptions = {};
  const bundleOpts: CliBundleOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (!argument.startsWith("--") && isFile(argument)) {
      if (buildOpts.entry && isFile(buildOpts.entry))
        fail("Entry point already exists.");
      buildOpts.entry = argument;
      bundleOpts.entry = argument;
      continue;
    }
    const eqIndex = argument.indexOf("=");
    const flag = eqIndex === -1 ? argument : argument.slice(0, eqIndex);
    const inlineValue = eqIndex === -1 ? undefined : argument.slice(eqIndex + 1);
    const nextValue = argv[index + 1] as string | undefined;
    const value = inlineValue ?? nextValue;
    switch (flag) {
      case "--entry":
        if (!value || value.startsWith("--")) fail("Entry point required.");
        if (buildOpts.entry && isFile(buildOpts.entry))
          fail("Entry point already exists.");
        buildOpts.entry = value as string;
        bundleOpts.entry = value as string;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      case "--outdir":
        if (!value || value.startsWith("--"))
          fail("Output directory required.");
        buildOpts.outDir = value;
        bundleOpts.outDir = value;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      case "--format":
        if (
          value !== "cjs" &&
          value !== "commonjs" &&
          value !== "esm" &&
          value !== "both"
        ) {
          fail("Format must be cjs, commonjs, esm, both.");
        }
        buildOpts.format =
          value === "cjs" || value === "commonjs"
            ? ["commonjs"]
            : value === "esm"
              ? ["esm"]
              : value === "both"
                ? ["commonjs", "esm"]
                : undefined;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      case "--tsconfig":
        if (!value || value.startsWith("--")) fail("Tsconfig path required.");
        buildOpts.tsconfig = value;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      case "--allow-update":
        if (inlineValue !== undefined) {
          buildOpts.allowUpdate = parseBooleanFlag("allow update", inlineValue);
        } else if (nextValue === "true" || nextValue === "false") {
          buildOpts.allowUpdate = parseBooleanFlag("allow update", nextValue);
          index += 1;
        } else {
          buildOpts.allowUpdate = true;
        }
        break;
      case "--check":
        if (inlineValue !== undefined) {
          buildOpts.check = parseBooleanFlag("check", inlineValue);
          bundleOpts.check = parseBundleBool(inlineValue);
        } else if (nextValue === "true" || nextValue === "false") {
          buildOpts.check = parseBooleanFlag("check", nextValue);
          bundleOpts.check = parseBundleBool(nextValue);
          index += 1;
        } else {
          buildOpts.check = true;
          bundleOpts.check = true;
        }
        break;
      case "--minify":
        if (inlineValue !== undefined) {
          buildOpts.minify = parseBooleanFlag("minify", inlineValue);
        } else if (nextValue === "true" || nextValue === "false") {
          buildOpts.minify = parseBooleanFlag("minify", nextValue);
          index += 1;
        } else {
          buildOpts.minify = true;
        }
        break;
    }
  }
  return { buildOpts, bundleOpts };
}

export function cliConfig(argv: string[]) {
  const opts = parseArgs(argv).buildOpts;
  if (isEmptyObject(opts)) return undefined;
  const point: EntryPoint = {
    entry: opts.entry ?? "",
    exportPath: ".",
    format: opts.format ?? ["esm"],
    tsconfigFilePath: opts.tsconfig ?? undefined,
    minify: opts.minify ?? false,
    checks: {
      checkAnonymous: opts.check ? true : false,
      checkDefaultExports: opts.check ? true : false,
      checkNpmInstalled: opts.check ? true : false,
    },
  };
  if (point.entry === "") return undefined;
  const config: SuSeeConfig = {
    entryPoints: [point],
    outDir: opts.outDir ?? "dist",
    allowUpdatePackageJson: opts.allowUpdate ?? false,
  };
  return config;
}

export function cliBundleOpts(argv: string[]) {
  const opts = parseArgs(argv).bundleOpts;
  if (isEmptyObject(opts)) return undefined;
  if (!opts.entry) return undefined;
  const options: CliBundleOpts = {
    entry: opts.entry,
    outDir: opts.outDir,
    check: opts.check
      ? {
          checkAnonymous: true,
          checkDefaultExports: true,
          checkNpmInstalled: true,
        }
      : undefined,
  };
  return options;
}
