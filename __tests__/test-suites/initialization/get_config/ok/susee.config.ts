import type { SuSeeConfig } from "../../../../_opt/types.js";

export default {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: ["esm", "commonjs"],
		},
	],
} as SuSeeConfig;
