import process from "node:process";
import { cliInit } from "./init.js";
import { cliConfig } from "./parse_args.js";
import { printHelp } from "./print_help.js";
import { build } from "../build.js";
import path from "node:path";
import fs from "node:fs";
import { logInfo, logError } from "@suseejs/susee_bundler";

async function getPackageVersion() {
  const pkgPath = path.resolve(process.cwd(), "package.json");
  const _pkg = await fs.promises.readFile(pkgPath, "utf8");
  const pkg = JSON.parse(_pkg);
  return pkg.version;
}

function errorLog() {
  printHelp();
  const info = "Unknown CLI usage";
  const cause = "";
  logError(info, cause, true);
}

async function cliBuild() {
  const args = process.argv.slice(2);
  const version = await getPackageVersion();
  if (args.length === 0) {
    errorLog();
  } else if (args.length === 1) {
    const arg0 = args[0];
    switch (arg0) {
      case "build":
        await build();
        break;
      case "init":
        await cliInit();
        break;
      case "--version":
      case "-v":
        logInfo(`susee v${version}`);
        break;
      case "--help":
      case "-h":
        printHelp();
        break;
      default:
        printHelp();
        break;
    }
  } else if (args.length > 1 && args[0] === "build") {
    const restArgs = args.slice(1);
    const config = cliConfig(restArgs);
    await build(config);
  } else {
    errorLog();
  }
}

cliBuild();