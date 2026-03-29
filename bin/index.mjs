#!/usr/bin/env node
import process from "node:process";
import init from "../src/binary/init.mjs";
import { susee } from "../dist/index.mjs";

async function suseeBuild() {
	const args = process.argv.slice(2);
	if (args.length === 0) {
		await susee();
	} else if (args.length === 1 && args[0] === "init") {
		await init();
	} else {
		console.error("Unknown CLI usage");
		process.exit(1);
	}
}

await suseeBuild();
