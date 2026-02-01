import type { SuSeeConfig } from "../../../src/config";

export default {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			moduleType: "both",
		},
		{
			entry: "src/config/index.ts",
			exportPath: "./config",
			moduleType: "both",
		},
	],
} as SuSeeConfig;
