import type { SuSeeConfig } from "@suseejs/types";
import suseeBannerText from "@suseejs/plugin-banner-text";
import suseeTerser from "@suseejs/plugin-terser";

const licenseText = `
/*! *****************************************************************************
Copyright (c) Pho Thin Mg <phothinmg@disroot.org>

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0
***************************************************************************** */
`.trim();

const config: SuSeeConfig = {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: "both",
		},
	],
	plugins: [suseeBannerText(licenseText), suseeTerser()],
};

export default config;
