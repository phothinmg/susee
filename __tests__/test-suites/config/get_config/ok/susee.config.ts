import type { SuSeeConfig } from "../../../../../src/nodejs/config/index.js";

export default {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: ["esm", "commonjs"],
		},
	],
} as SuSeeConfig;
