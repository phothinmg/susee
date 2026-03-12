import type { SuSeeConfig } from "@suseejs/types";

export default {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: "both",
		},
		{
			entry: "src/config/index.ts",
			exportPath: "./config",
			format: "both",
		},
	],
} as SuSeeConfig;
