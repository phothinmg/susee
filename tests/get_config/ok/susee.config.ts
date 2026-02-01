import type { SuSeeConfig } from "../../../src/config";

export default {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      moduleType: "both",
    }
  ],
} as SuSeeConfig;
