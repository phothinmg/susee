import process from "node:process";
import path from "node:path";
import { susee } from "../src/index.js";
import init from "./init.js";
import { suseeCli } from "../src/cli.js";

function isFile(entry: string) {
  const exts = [".js", ".ts", ".mts", ".mjs"];
  return exts.includes(path.extname(entry));
}

function fail(message: string) {
  console.error(message);
  process.exit(1);
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

function parseArgs(argv: any[]) {
  const opts: {
    entry: string;
    outDir?: string | undefined;
    format?: "cjs" | "esm" | undefined;
    tsconfig?: string | undefined;
    rename?: boolean | undefined;
    allowUpdate?: boolean | undefined;
    minify?: boolean | undefined;
  } = {
    entry: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (index === 0 && !argument.startsWith("--") && isFile(argument)) {
      opts["entry"] = argument;
      continue;
    }
    const [flag, inlineValue] = argument.split("=", 2);
    const nextValue = argv[index + 1] as string | undefined;
    const value = inlineValue ?? nextValue;
    switch (flag) {
      case "--entry":
        if (!value || value.startsWith("--")) fail("Entry point required.");
        if (opts.entry !== "" && isFile(opts.entry))
          fail("Entry point already exists.");
        opts["entry"] = value as string;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      case "--outdir":
        if (!value || value.startsWith("--"))
          fail("Output directory required.");
        opts["outDir"] = value;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      case "--format":
        if (value !== "cjs" && value !== "esm") {
          fail("Format must be cjs or esm.");
        }
        opts["format"] = value as "cjs" | "esm" | undefined;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      case "--tsconfig":
        if (!value || value.startsWith("--")) fail("Tsconfig path required.");
        opts["tsconfig"] = value;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      case "--rename":
        if (inlineValue !== undefined) {
          opts["rename"] = parseBooleanFlag("rename", inlineValue);
        } else if (nextValue === "true" || nextValue === "false") {
          opts["rename"] = parseBooleanFlag("rename", nextValue);
          index += 1;
        } else {
          opts["rename"] = true;
        }
        break;
      case "--allow-update":
        if (inlineValue !== undefined) {
          opts["allowUpdate"] = parseBooleanFlag("allow update", inlineValue);
        } else if (nextValue === "true" || nextValue === "false") {
          opts["allowUpdate"] = parseBooleanFlag("allow update", nextValue);
          index += 1;
        } else {
          opts["allowUpdate"] = true;
        }
        break;
      case "--minify":
        if (inlineValue !== undefined) {
          opts["minify"] = parseBooleanFlag("minify", inlineValue);
        } else if (nextValue === "true" || nextValue === "false") {
          opts["minify"] = parseBooleanFlag("minify", nextValue);
          index += 1;
        } else {
          opts["minify"] = true;
        }
        break;
    }
  }
  if (isEmptyObject(opts) || opts.entry === "") {
    fail("Entry point required");
  }
  return opts;
}

function printHelp() {
  console.log(`Susee CLI.

Usage:
  susee                                 Build using susee.config.{ts,js,mjs}
  susee init                            Generate susee.config.{ts,js,mjs}
  susee --help                          Show this message
  susee build <entry> [options]         Build from a single entry file

Options:
  --entry <path>                       Entry file (optional if provided as positional <entry>)
  --outdir <path>                      Output directory
  --format <cjs|esm>                   Output module format
  --tsconfig <path>                    Custom tsconfig path
  --rename[=true|false]                Enable/disable renaming
  --allow-update[=true|false]          Enable/disable dependency update
  --minify[=true|false]                Enable/disable minification

Examples:
  susee build src/index.ts --outdir dist
  susee build --entry src/index.ts --format esm --minify
  
`);
}

async function suseeBuild() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await susee();
  } else if (args.length === 1) {
    if (args[0] === "--help") {
      printHelp();
    }
    if (args[0] === "init") {
      await init();
    }
    if (args[0] === "build") {
      printHelp();
    }
  } else if (
    args.length > 1 &&
    args[0] === "build" &&
    (args[1] === "--help" || args[1] === "-h")
  ) {
    printHelp();
  } else if (args.length > 1 && args[0] === "build") {
    const _r = parseArgs(args.slice(1));
    await suseeCli(
      _r.entry,
      _r.format,
      _r.outDir,
      _r.tsconfig,
      _r.rename,
      _r.allowUpdate,
      _r.minify,
    );
  } else {
    console.error("Unknown CLI usage");
    process.exit(1);
  }
}

void suseeBuild().catch((error) => {
  console.error(error);
  process.exit(1);
});
