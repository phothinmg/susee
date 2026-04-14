import type { SuSeeConfig } from "../../../../_opt/types.js";

export default {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: "both",
		},
		{
			entry: "src/config/index.ts",
			exportPath: ".",
			format: "both",
		},
	],
} as SuSeeConfig;
