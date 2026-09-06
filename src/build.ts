import { Compiler } from "./compiler/index.js";
import { generateFinalBuildOptions, type SuSeeConfig } from "./config/index.js";
import { LogTimer } from "@suseejs/susee_bundler";

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
  const buildOptions = await generateFinalBuildOptions(options);
  const compiler = new Compiler(buildOptions);
  await compiler.compile();
  buildTime.buildTime();
}

export { build };
