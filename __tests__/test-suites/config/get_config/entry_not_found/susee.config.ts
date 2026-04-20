import type { SuSeeConfig } from "../../../../../src/lib/suseeConfig.js";

export default {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["commonjs", "esm"],
    },
    {
      entry: "src/config/index.ts",
      exportPath: "./config",
      format: ["commonjs", "esm"],
    },
  ],
} as SuSeeConfig;
