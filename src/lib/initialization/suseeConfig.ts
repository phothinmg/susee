import resolves from "@suseejs/resolves";
import tcolor from "@suseejs/tcolor";
import type { SuseePlugin, SuseePluginFunction } from "@suseejs/types";
import ts from "typescript";
import type { EntryPoint, SuSeeConfig } from "../types.js";
import { utilities } from "../utils.js";

export interface Point {
  entry: string;
  exportPath: "." | `./${string}`;
  format: "commonjs" | "esm" | "both";
  tsconfigFilePath: string | undefined;
  renameDuplicates: boolean;
  outDirPath: string;
}
interface FinalSuseeConfig {
  points: Point[];
  plugins: (SuseePlugin | SuseePluginFunction)[];
  allowUpdatePackageJson: boolean;
  outDir: string;
}
/**
 * Finds the path of the susee.config file if it exists.
 * It checks for the existence of "susee.config.ts", "susee.config.js", and "susee.config.mjs" in the current working directory.
 * The first file found is returned.
 * @returns {string | undefined} - path to the susee.config file or undefined if it does not exist.
 */
const getConfigPath = (): string | undefined => {
  const fileNames = ["susee.config.ts", "susee.config.js", "susee.config.mjs"];
  let configFile: string | undefined;
  for (const file of fileNames) {
    const _file = ts.sys.resolvePath(file);
    if (ts.sys.fileExists(_file)) {
      configFile = _file;
      break;
    }
  }
  return configFile;
};

/**
 * Checks if the given entries have at least one entry and if there are any duplicate export paths.
 * If there are no entries, it will exit with code 1 and print an error message.
 * If there are any duplicate export paths, it will exit with code 1 and print an error message.
 * It will also check if each entry file exists, if not, it will exit with code 1 and print an error message.
 * @param {EntryPoint[]} entries - array of entry points
 */
function checkEntries(entries: EntryPoint[]) {
  if (entries.length < 1) {
    console.error(
      tcolor.magenta(
        `No entry found in susee.config file, at least one entry required`,
      ),
    );
    ts.sys.exit(1);
  }
  const objectStore: Record<string, boolean> = {};
  const duplicateExportPaths: string[] = [];

  for (const obj of entries) {
    const value = obj.exportPath;

    if (objectStore[value]) {
      duplicateExportPaths.push(`"${value}"`);
    } else {
      objectStore[value] = true;
    }
  }
  if (duplicateExportPaths.length > 0) {
    console.error(
      tcolor.magenta(
        `Duplicate export paths/path (${duplicateExportPaths.join(",")}) found in your susee.config file , that will error for bundled output`,
      ),
    );
    ts.sys.exit(1);
  }

  for (const obj of entries) {
    if (!ts.sys.fileExists(ts.sys.resolvePath(obj.entry))) {
      console.error(tcolor.magenta(`Entry file ${obj.entry} dose not exists.`));
      ts.sys.exit(1);
    }
  }
}

/**
 * Get SuSee configuration from susee.config file (susee.config.ts, susee.config.js, susee.config.mjs)
 * @returns {Promise<FinalSuseeConfig>} - SuSee configuration
 * @throws {Error} - when no susee.config file found
 */
async function finalSuseeConfig(): Promise<FinalSuseeConfig> {
  const configPath = getConfigPath();
  if (configPath === undefined) {
    console.error(
      tcolor.magenta(
        `No susee.config file ("susee.config.ts", "susee.config.js", "susee.config.mjs") found`,
      ),
    );
    ts.sys.exit(1);
  }
  const _default: { default: SuSeeConfig } = await import(configPath as string);
  const config = _default.default;
  const entryCheck = resolves([[checkEntries, config.entryPoints]]);
  await entryCheck.series();
  await utilities.wait(1000);
  const out_dir = config.outDir ?? "dist";
  const points: Point[] = [];
  for (const ent of config.entryPoints) {
    const point = {
      entry: ent.entry,
      exportPath: ent.exportPath,
      format: ent.format ?? "esm",
      tsconfigFilePath: ent.tsconfigFilePath ?? undefined,
      renameDuplicates: ent.renameDuplicates ?? true,
      outDirPath:
        ent.exportPath === "."
          ? out_dir
          : `${out_dir}${ent.exportPath.slice(1)}`,
    } as Point;
    points.push(point);
  }
  return {
    points,
    plugins: config.plugins ?? [],
    allowUpdatePackageJson: config.allowUpdatePackageJson ?? true,
    outDir: out_dir,
  } as FinalSuseeConfig;
}

export { finalSuseeConfig };
