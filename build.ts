import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { build } from "./src/index.js";
import { files } from "@suseejs/files";
import { suseeTerser } from "@suseejs/terser-plugin";
import { suseeBannerText } from "@suseejs/banner-text-plugin";

const ef = "dist/bin/index.mjs";
const bf = "bin/susee";

async function grantCli() {
	const file = path.resolve(process.cwd(), ef);
	const shebang = "#!/usr/bin/env node";
	if (fs.existsSync(file)) {
		let content = await fs.promises.readFile(file, "utf8");
		if (!content.startsWith(shebang)) {
			content = `${shebang}\n${content}`;
			await fs.promises.writeFile(file, content);
		}
	}
}

async function writeBinary() {
	const content = `#!/usr/bin/env node\n\nimport("../dist/bin/index.mjs");`;
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
			entry: "src/index.ts",
			exportPath: ".",
			format: ["esm", "commonjs"],
			plugins: [suseeBannerText(bannerText), suseeTerser],
		},
	],
	allowUpdatePackageJson: true,
	outDir: "dist",
});
const cliCommand =
	"npx tsx src/cli/index.ts build src/cli/index.ts --format esm --outdir dist/bin --minify";

await new Promise<void>((resolve, reject) => {
	exec(cliCommand, async (error) => {
		if (error) {
			reject(error);
			return;
		}

		try {
			await grantCli();
			await fs.promises.chmod(path.resolve(process.cwd(), ef), 0o755);
			await writeBinary();
			await fs.promises.chmod(path.resolve(process.cwd(), bf), 0o755);
			resolve();
		} catch (chmodOrGrantError) {
			reject(chmodOrGrantError);
		}
	});
});
