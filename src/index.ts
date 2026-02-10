import utilities from "@suseejs/utils";
import collections from "./lib/init/index.js";
import bundle from "./lib/bundle/index.js";
import Compiler from "./lib/compile/index.js";
import type { SuSeeConfig, SuseePlugin } from "@suseejs/types";

async function susee() {
  const collected = await collections();
  await utilities.wait(1000);
  const bundled = await bundle(collected);
  await utilities.wait(1000);
  const compiler = new Compiler(bundled);
  await compiler.compile();
}

export type { SuSeeConfig, SuseePlugin };
export { susee };
