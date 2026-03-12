import type { SuSeeConfig } from "@suseejs/types";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: "both",
      tsconfigFilePath: "custom-tsconfig.json",
    },
    {
      entry: "src/mod.ts",
      exportPath: "./mod",
      format: "both",
    },
  ],
};

export default config;
