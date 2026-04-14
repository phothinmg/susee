import type { SuSeeConfig } from "susee";

export default {
  entryPoints: [
    {
      entry: "src/index.ts",
      format: "both",
      exportPath: ".",
    },
  ],
} as SuSeeConfig;
