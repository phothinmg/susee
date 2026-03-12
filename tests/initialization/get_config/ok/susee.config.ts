import type { SuSeeConfig } from "@suseejs/types";

export default {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: "both",
		},
	],
} as SuSeeConfig;
