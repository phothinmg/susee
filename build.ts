import fs from "node:fs";
import path from "node:path";
import { build } from "./src/nodejs/index.js";
import { files } from "./src/nodejs/helpers/files.js";
import { suseeBannerText } from "@suseejs/banner-text-plugin";

const ef = "dist/bin/index.mjs";
const bf = "bin/susee";

async function writeBinary() {
	const content = `#!/usr/bin/env node\n\nimport {suseeCliBuild} from "../dist/index.mjs";\nsuseeCliBuild()`;
	await files.writeFile(bf, content);
}

const bannerText = `/*! *****************************************************************************
Copyright (c) Pho Thin Mg <phothinmg@disroot.org>

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0
***************************************************************************** */`;

await build({
	entryPoints: [
		{
			entry: "src/nodejs/index.ts",
			exportPath: ".",
			format: ["esm", "commonjs"],
			plugins: [suseeBannerText(bannerText)],
		},
	],
	allowUpdatePackageJson: true,
	outDir: "dist",
});
try {
	await writeBinary();
	await fs.promises.chmod(path.resolve(process.cwd(), bf), 0o755);
} catch (chmodOrGrantError) {
	console.log(chmodOrGrantError);
}
