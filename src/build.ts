import { Compiler } from "./compiler/index.js";
import {
  type BuildOptions,
  finalSuseeConfig,
  generateBuildOptions,
  type SuSeeConfig,
} from "./config/index.js";
import { logError,LogTimer } from "@suseejs/susee_bundler";

/**
 * Run a Susee build.
 *
 * Resolution order:
 * 1. Use `options` when provided.
 * 2. Otherwise try loading root config via `finalSuseeConfig()`.
 *
 * If neither source is available, this logs an error and exits with code 1.
 */
async function build(options?: SuSeeConfig) {
  const buildTime = new LogTimer();
  let buildOptions = {} as BuildOptions;
  const _buildOptions = await finalSuseeConfig();
  if (!options && !_buildOptions) {
    const info = "Required build options or susee config file at root.You can use `npx susee init` to create susee config file at root";
    const cause = "No build options or susee config file at root.";
    logError(info,cause,true);
  }
  if (options) {
    buildOptions = generateBuildOptions(options);
  } else if (_buildOptions) {
    buildOptions = _buildOptions;
  }
  const compiler = new Compiler(buildOptions);
  await compiler.compile();
  buildTime.buildTime();
}

export { build };
