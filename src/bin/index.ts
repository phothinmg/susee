#!/usr/bin/env node
import process from "node:process";
import { susee } from "../index.js";
import init from "./init.js";

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

void suseeBuild().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
