import { Compiler } from "./lib/compiler.js";
import {
  finalSuseeConfig,
  generateBuildOptions,
  type BuildOptions,
  type SuSeeConfig,
} from "./lib/suseeConfig.js";

async function build(options?: SuSeeConfig) {
  let buildOptions = {} as BuildOptions;
  if (options) {
    buildOptions = generateBuildOptions(options);
  } else {
    buildOptions = await finalSuseeConfig();
  }
  const compiler = new Compiler(buildOptions);
  await compiler.compile();
}

export { build };
