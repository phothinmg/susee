import type { SuSeeConfig } from "../../../../../src/suseeConfig.js";

export default {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: ["esm", "commonjs"],
		},
	],
} as SuSeeConfig;
