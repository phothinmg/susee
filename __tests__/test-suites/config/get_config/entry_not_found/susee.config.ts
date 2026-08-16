import type { SuSeeConfig } from "../../../../../node_src/config/index.js";

export default {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: ["commonjs", "esm"],
		},
		{
			entry: "src/config/index.ts",
			exportPath: "./config",
			format: ["commonjs", "esm"],
		},
	],
} as SuSeeConfig;
