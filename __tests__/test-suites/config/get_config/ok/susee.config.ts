import type { SuSeeConfig } from "../../../../../src/lib/suseeConfig.js";

export default {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
  ],
} as SuSeeConfig;
