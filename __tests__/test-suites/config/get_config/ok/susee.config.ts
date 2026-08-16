import type { SuSeeConfig } from "../../../../../node_src/config/index.js";

export default {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: ["esm", "commonjs"],
		},
	],
} as SuSeeConfig;
