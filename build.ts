import utils from "@suseejs/utils";
import { exec } from "node:child_process";
import { susee } from "./src/index.js";

async function writeBin() {
	const filePath = utils.file.resolvePath("bin/index.mjs");
	const text = `#!/usr/bin/env node\nimport  {susee} from "../dist/index.mjs";\nawait susee();`;
	await utils.file.writeFile(filePath, text);
}

async function build() {
	await susee();
	await writeBin();
	await utils.wait(1000);
	exec("chmod +x bin/index.mjs");
}

await build();
