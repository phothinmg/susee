import path from "node:path";
import { logError } from "@suseejs/susee_bundler";
import {
  type SuSeeConfig,
  type EntryPoint,
} from "../config/index.js";

interface CliOptions {
  entry?: string;
  outDir?: string | undefined;
  format?: ("commonjs" | "esm")[] | undefined;
  tsconfig?: string | undefined;
  allowUpdate?: boolean | undefined;
  minify?: boolean | undefined;
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

function parseArgs(argv: string[]) {
  const opts: CliOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (index === 0 && !argument.startsWith("--") && isFile(argument)) {
      opts.entry = argument;
      continue;
    }
    const [flag, inlineValue] = argument.split("=", 2);
    const nextValue = argv[index + 1] as string | undefined;
    const value = inlineValue ?? nextValue;
    switch (flag) {
      case "--entry":
        if (!value || value.startsWith("--")) fail("Entry point required.");
        if (opts.entry && isFile(opts.entry))
          fail("Entry point already exists.");
        opts.entry = value as string;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      case "--outdir":
        if (!value || value.startsWith("--"))
          fail("Output directory required.");
        opts.outDir = value;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      case "--format":
        if (value !== "cjs" && value !== "commonjs" && value !== "esm") {
          fail("Format must be cjs, commonjs, esm, both.");
        }
        opts.format =
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
        opts.tsconfig = value;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      case "--allow-update":
        if (inlineValue !== undefined) {
          opts.allowUpdate = parseBooleanFlag("allow update", inlineValue);
        } else if (nextValue === "true" || nextValue === "false") {
          opts.allowUpdate = parseBooleanFlag("allow update", nextValue);
          index += 1;
        } else {
          opts.allowUpdate = true;
        }
        break;
      case "--check":
        if (inlineValue !== undefined) {
          opts.check = parseBooleanFlag("check", inlineValue);
        } else if (nextValue === "true" || nextValue === "false") {
          opts.check = parseBooleanFlag("check", nextValue);
          index += 1;
        } else {
          opts.check = true;
        }
        break;
      case "--minify":
        if (inlineValue !== undefined) {
          opts.minify = parseBooleanFlag("minify", inlineValue);
        } else if (nextValue === "true" || nextValue === "false") {
          opts.minify = parseBooleanFlag("minify", nextValue);
          index += 1;
        } else {
          opts.minify = true;
        }
        break;
    }
  }
  return opts;
}

export function cliConfig(argv: string[]) {
  const cliOpts = parseArgs(argv);
  if (isEmptyObject(cliOpts)) return undefined;
  const point: EntryPoint = {
    entry: cliOpts.entry ?? "",
    exportPath: ".",
    format: cliOpts.format ?? ["esm"],
    tsconfigFilePath: cliOpts.tsconfig ?? undefined,
    minify: cliOpts.minify ?? false,
    checks: {
      checkAnonymous: cliOpts.check ? true : false,
      checkDefaultExports: cliOpts.check ? true : false,
      checkNpmInstalled: cliOpts.check ? true : false,
    },
  };
  if(point.entry === "") return undefined;
  const config:SuSeeConfig = {
    entryPoints:[point],
    outDir: cliOpts.outDir ?? "dist",
    allowUpdatePackageJson: cliOpts.allowUpdate ?? false
  }
  return config;
}
