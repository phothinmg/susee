import type { SuSeeConfig } from "../../../../../src/suseeConfig.js";

export default {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: ["commonjs", "esm"],
		},
		{
			entry: "src/config/index.ts",
			exportPath: ".",
			format: ["commonjs", "esm"],
		},
	],
} as SuSeeConfig;
