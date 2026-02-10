import type { SuSeeConfig, SuseePlugin } from "@suseejs/types";

const licenseText = `
/*! *****************************************************************************
Copyright (c) Pho Thin Mg <phothinmg@disroot.org>

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0
***************************************************************************** */
`.trim();

const text = (str: string): SuseePlugin => {
	return {
		type: "post-process",
		async: false,
		func(code, file) {
			if (file?.match(/.js/g)) {
				code = `${str}\n${code}`;
			}
			return code;
		},
	};
};

const config: SuSeeConfig = {
	entryPoints: [
		{
			entry: "src/index.ts",
			exportPath: ".",
			format: "both",
		},
	],
	plugins: [text(licenseText)],
};

export default config;
