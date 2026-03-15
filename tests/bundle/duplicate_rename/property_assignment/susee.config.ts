import type { SuSeeConfig } from "../../../../src/lib/types.js";

export default {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: "both",
		},
	],
} as SuSeeConfig;
