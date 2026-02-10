import { describe, it } from "node:test";
import assert from "node:assert";
import ts from "typescript";
import { exitWithCodeOneAndMessage } from "./test_helpers.js";
import getConfig from "../src/lib/init/config.js";

describe("Get Config Tests", async () => {
	it("If duplicate path found in susee.config return exit with 0 and warn message if it is provide ", (t, done) => {
		const filePath = "lib/get_config.ts";
		const cwd = process.cwd();
		const temp = ts.sys.resolvePath("tests/get_config/duplicate");
		process.chdir(temp);
		try {
			exitWithCodeOneAndMessage(
				filePath,
				done,
				`\x1B[35mDuplicate export paths/path (".") found in your susee.config file , that will error for bundled output\x1B[39m`,
			);
		} finally {
			process.chdir(cwd);
		}
	});
	// ===
	it("If empty entries in susee.config return exit with 0 and warn message if it is provide ", (t, done) => {
		const temp = ts.sys.resolvePath("tests/get_config/empty_entries");
		const filePath = "lib/get_config.ts";
		const cwd = process.cwd();
		process.chdir(temp);
		try {
			exitWithCodeOneAndMessage(
				filePath,
				done,
				"\x1B[35mNo entry found in susee.config file, at least one entry required\x1B[39m",
			);
		} finally {
			process.chdir(cwd);
		}
	});
	// ===
	it("If no susee.config file found, return exit with 0 and warn message if it is provide ", (t, done) => {
		const temp = ts.sys.resolvePath("tests/get_config/not_found");
		const filePath = "lib/get_config.ts";
		const cwd = process.cwd();
		process.chdir(temp);
		try {
			exitWithCodeOneAndMessage(
				filePath,
				done,
				'\x1B[35mNo susee.config file ("susee.config.ts", "susee.config.js", "susee.config.mjs") found\x1B[39m',
			);
		} finally {
			process.chdir(cwd);
		}
	});
	// ===
	it("If one of entry file in susee.config file dose exits , return exit with 0 and warn message if it is provide ", (t, done) => {
		const temp = ts.sys.resolvePath("tests/get_config/entry_not_found");
		const filePath = "lib/get_config.ts";
		const cwd = process.cwd();
		process.chdir(temp);
		try {
			exitWithCodeOneAndMessage(
				filePath,
				done,
				"\x1B[35mEntry file src/config/index.ts dose not exists.\x1B[39m",
			);
		} finally {
			process.chdir(cwd);
		}
	});
	//==
	it("If no error", async () => {
		const temp = ts.sys.resolvePath("tests/get_config/ok");
		const cwd = process.cwd();
		process.chdir(temp);
		try {
			const config = await getConfig();

			assert.deepEqual(config.points, [
				{
					entry: "src/index.ts",
					exportPath: ".",
					format: "both",
					outDir: "dist",
					renameDuplicates: true,
					tsconfigFilePath: undefined,
				},
			]);

			assert.deepEqual(config.plugins, []);

			assert.deepEqual(config.allowUpdatePackageJson, true);
		} finally {
			process.chdir(cwd);
		}
	});
});
