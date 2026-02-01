import ts from "typescript";
import tcolor from "@suseejs/tcolor";
import resolves from "@phothinmaung/resolves";
import utils from "@suseejs/utils";
import type { SuSeeConfig, EntryPoint } from "./config";

const getConfigPath = () => {
  const fileNames = ["susee.config.ts", "susee.config.js", "susee.config.mjs"];
  let configFile: string | undefined = undefined;
  for (const file of fileNames) {
    const _file = ts.sys.resolvePath(file);
    if (ts.sys.fileExists(_file)) {
      configFile = _file;
      break;
    }
  }
  return configFile;
};

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
  const duplicates: string[] = [];

  for (const obj of entries) {
    const value = obj["exportPath"];

    if (objectStore[value]) {
      duplicates.push(`"${value}"`);
    } else {
      objectStore[value] = true;
    }
  }
  if (duplicates.length > 0) {
    console.error(
      tcolor.magenta(
        `Duplicate export paths/path (${duplicates.join(",")}) found in your susee.config file , that will error for bundled output`,
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

async function getConfig() {
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
  const entryCheck = resolves<[void]>([[checkEntries, config.entryPoints]]);
  await entryCheck.series();
  await utils.wait(1000);
  return {
    entryPoints: config.entryPoints,
    postProcessHooks: config.postProcessHooks ?? [],
    allowUpdatePackageJson: config.allowUpdatePackageJson ?? true,
    nodeEnv: config.nodeEnv ?? true,
  };
}

export default getConfig;
