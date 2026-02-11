import tcolor from "@suseejs/tcolor";
import type { SuSeeConfig, SuseePlugin, BundleHandler } from "@suseejs/types";
import utilities from "@suseejs/utils";
import bundle from "./lib/bundle/index.js";
import Compiler from "./lib/compile/index.js";
import collections from "./lib/init/index.js";
import { Zlib } from "node:zlib";

async function susee(): Promise<void> {
  console.time(`${tcolor.cyan(`Done`)}`);
  const collected = await collections();
  await utilities.wait(1000);
  const bundled = await bundle(collected);
  await utilities.wait(1000);
  const compiler = new Compiler(bundled);
  await compiler.compile();
  console.timeEnd(`${tcolor.cyan(`Done`)}`);
}

export type { SuSeeConfig, SuseePlugin };
export { susee };
