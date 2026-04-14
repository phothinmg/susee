import process from "node:process";
import { susee } from "../index.js";
import { suseeCli } from "./cli.js";
import init from "./lib/init.js";
import { parseArgs } from "./lib/parse_argv.js";
import { printHelp } from "./lib/print_help.js";

async function suseeCliBuild() {
	const args = process.argv.slice(2);
	if (args.length === 0) {
		await susee();
	} else if (args.length === 1) {
		if (args[0] === "--help") {
			printHelp();
		}
		if (args[0] === "init") {
			await init();
		}
		if (args[0] === "build") {
			printHelp();
		}
	} else if (
		args.length > 1 &&
		args[0] === "build" &&
		(args[1] === "--help" || args[1] === "-h")
	) {
		printHelp();
	} else if (args.length > 1 && args[0] === "build") {
		const _r = parseArgs(args.slice(1));
		await suseeCli(
			_r.entry,
			_r.format,
			_r.outDir,
			_r.tsconfig,
			_r.rename,
			_r.allowUpdate,
			_r.minify,
		);
	} else {
		console.error("Unknown CLI usage");
		process.exit(1);
	}
}

void suseeCliBuild().catch((error) => {
	console.error(error);
	process.exit(1);
});
