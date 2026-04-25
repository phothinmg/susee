import assert from "node:assert";
import { describe, it } from "node:test";
import { printHelp } from "../../../src/cli/lib/print_help.js";

describe("print_help", () => {
	it("prints usage, options, and examples", () => {
		const originalLog = console.log;
		let output = "";
		console.log = (...args: unknown[]) => {
			output += `${args.join(" ")}\n`;
		};

		try {
			printHelp();
		} finally {
			console.log = originalLog;
		}

		assert.match(output, /Susee CLI\./);
		assert.match(output, /Usage:/);
		assert.match(output, /susee build <entry> \[options\]/);
		assert.match(output, /Options:/);
		assert.match(output, /--entry <path>/);
		assert.match(output, /--allow-update\[=true\|false\]/);
		assert.match(output, /Examples:/);
	});
});
