import { exec } from "node:child_process";
import { susee } from "./src/index.js";
import utils from "@suseejs/utils";
import path from "node:path";

async function writeBin() {
	const filePath = path.resolve(process.cwd(), "bin/index.mjs");
	const text = `#!/usr/bin/env node\nimport  {susee} from "../dist/index.mjs";\nawait susee();`;
	await utils.file.writeFile(filePath, text);
}

async function build() {
	await susee();
	exec("chmod +x bin/index.mjs");
}

await build();
