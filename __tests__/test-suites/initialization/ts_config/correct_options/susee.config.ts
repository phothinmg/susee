import type { SuSeeConfig } from "../../../../_opt/types.js";

const config: SuSeeConfig = {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: "both",
		},
		{
			entry: "src/mod.ts",
			exportPath: "./mod",
			format: "both",
		},
	],
};

export default config;
