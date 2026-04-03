import { exec } from "node:child_process";
import { susee } from "./src/index.js";

async function build() {
	await susee();
	exec("chmod +x dist/bin/index.mjs");
}

await build();
