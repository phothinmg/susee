import assert from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import {
	getDefaultOptions,
	isEmptyObject,
	isFile,
	parseBooleanFlag,
	parseArgs,
} from "../../../src/cli/lib/parse_argv.js";
import { setupTempDir } from "../test_helpers.js";

const execFileAsync = promisify(execFile);

function getTsxBin() {
	return path.resolve(
		process.cwd(),
		"node_modules",
		".bin",
		process.platform === "win32" ? "tsx.cmd" : "tsx",
	);
}

describe("parse_argv", () => {
	it("isFile recognizes valid source extensions", () => {
		assert.strictEqual(isFile("src/index.ts"), true);
		assert.strictEqual(isFile("src/index.js"), true);
		assert.strictEqual(isFile("src/index.mts"), true);
		assert.strictEqual(isFile("src/index.cjs"), true);
		assert.strictEqual(isFile("README.md"), false);
		assert.strictEqual(isFile("src/noext"), false);
	});

	it("isEmptyObject recognizes plain empty objects", () => {
		assert.strictEqual(isEmptyObject({}), true);
		assert.strictEqual(isEmptyObject({ a: 1 }), false);
		assert.strictEqual(isEmptyObject([]), false);
		assert.strictEqual(isEmptyObject("value"), false);
	});

	it("parseArgs supports positional entry and full flag set", () => {
		const actual = parseArgs([
			"src/index.ts",
			"--outdir",
			"dist",
			"--format",
			"cjs",
			"--tsconfig",
			"tsconfig.build.json",
			"--rename=false",
			"--allow-update",
			"--minify=true",
			"--warning",
		]);

		assert.deepStrictEqual(actual, {
			entry: "src/index.ts",
			outDir: "dist",
			format: "commonjs",
			tsconfig: "tsconfig.build.json",
			rename: false,
			allowUpdate: true,
			minify: true,
			warning: true,
		});
	});

	it("parseArgs supports --entry form and default booleans", () => {
		const actual = parseArgs(["--entry", "src/index.ts", "--format", "esm"]);

		assert.deepStrictEqual(actual, {
			entry: "src/index.ts",
			format: "esm",
		});
	});

	it("parseArgs supports inline values and explicit boolean values", () => {
		const actual = parseArgs([
			"--entry=src/index.ts",
			"--outdir=lib",
			"--tsconfig=tsconfig.json",
			"--rename",
			"false",
			"--allow-update=false",
			"--minify",
			"true",
			"--warning=false",
		]);

		assert.deepStrictEqual(actual, {
			entry: "src/index.ts",
			outDir: "lib",
			tsconfig: "tsconfig.json",
			rename: false,
			allowUpdate: false,
			minify: true,
			warning: false,
		});
	});

	it("parseBooleanFlag parses true and false", () => {
		assert.strictEqual(parseBooleanFlag("warning", "true"), true);
		assert.strictEqual(parseBooleanFlag("warning", "false"), false);
	});

	it("getDefaultOptions fills defaults consistently", () => {
		const actual = getDefaultOptions({
			entry: "src/index.ts",
			format: "commonjs",
			minify: true,
		});

		assert.deepStrictEqual(actual, {
			entry: "src/index.ts",
			outDir: "dist",
			format: "commonjs",
			tsconfig: undefined,
			rename: true,
			allowUpdate: false,
			minify: true,
			warning: false,
			plugins: [],
		});
	});

	it("parseArgs exits for invalid format", async () => {
		const tmpDir = await setupTempDir("parse-argv-invalid-format");
		const scriptPath = path.join(tmpDir, "invalid-format.ts");
		const parseArgvPath = path
			.resolve(process.cwd(), "src/cli/lib/parse_argv.ts")
			.replaceAll("\\", "/");

		await fs.writeFile(
			scriptPath,
			`import { parseArgs } from "${parseArgvPath}";
parseArgs(["src/index.ts", "--format", "amd"]);
`,
			"utf8",
		);

		await assert.rejects(
			execFileAsync(getTsxBin(), [scriptPath], { cwd: tmpDir }),
			(error: NodeJS.ErrnoException) => {
				assert.strictEqual(error.code, 1);
				const stderr = String(error.message ?? "");
				assert.match(stderr, /Format must be cjs, commonjs, or esm\./);
				return true;
			},
		);
	});

	it("parseArgs exits for invalid boolean flag value", async () => {
		const tmpDir = await setupTempDir("parse-argv-invalid-boolean");
		const scriptPath = path.join(tmpDir, "invalid-boolean.ts");
		const parseArgvPath = path
			.resolve(process.cwd(), "src/cli/lib/parse_argv.ts")
			.replaceAll("\\", "/");

		await fs.writeFile(
			scriptPath,
			`import { parseArgs } from "${parseArgvPath}";
parseArgs(["src/index.ts", "--rename=maybe"]);
`,
			"utf8",
		);

		await assert.rejects(
			execFileAsync(getTsxBin(), [scriptPath], { cwd: tmpDir }),
			(error: NodeJS.ErrnoException) => {
				assert.strictEqual(error.code, 1);
				const stderr = String(error.message ?? "");
				assert.match(stderr, /Type of rename must be boolean\./);
				return true;
			},
		);
	});

	it("parseArgs exits when entry is duplicated", async () => {
		const tmpDir = await setupTempDir("parse-argv-duplicate-entry");
		const scriptPath = path.join(tmpDir, "duplicate-entry.ts");
		const parseArgvPath = path
			.resolve(process.cwd(), "src/cli/lib/parse_argv.ts")
			.replaceAll("\\", "/");

		await fs.writeFile(
			scriptPath,
			`import { parseArgs } from "${parseArgvPath}";
parseArgs(["src/index.ts", "--entry", "src/second.ts"]);
`,
			"utf8",
		);

		await assert.rejects(
			execFileAsync(getTsxBin(), [scriptPath], { cwd: tmpDir }),
			(error: NodeJS.ErrnoException) => {
				assert.strictEqual(error.code, 1);
				const stderr = String(error.message ?? "");
				assert.match(stderr, /Entry point already exists\./);
				return true;
			},
		);
	});

	it("parseArgs exits when --entry value is missing", async () => {
		const tmpDir = await setupTempDir("parse-argv-missing-entry-value");
		const scriptPath = path.join(tmpDir, "missing-entry-value.ts");
		const parseArgvPath = path
			.resolve(process.cwd(), "src/cli/lib/parse_argv.ts")
			.replaceAll("\\", "/");

		await fs.writeFile(
			scriptPath,
			`import { parseArgs } from "${parseArgvPath}";
parseArgs(["--entry", "--minify"]);
`,
			"utf8",
		);

		await assert.rejects(
			execFileAsync(getTsxBin(), [scriptPath], { cwd: tmpDir }),
			(error: NodeJS.ErrnoException) => {
				assert.strictEqual(error.code, 1);
				const stderr = String(error.message ?? "");
				assert.match(stderr, /Entry point required\./);
				return true;
			},
		);
	});

	it("parseArgs exits when --outdir value is missing", async () => {
		const tmpDir = await setupTempDir("parse-argv-missing-outdir");
		const scriptPath = path.join(tmpDir, "missing-outdir.ts");
		const parseArgvPath = path
			.resolve(process.cwd(), "src/cli/lib/parse_argv.ts")
			.replaceAll("\\", "/");

		await fs.writeFile(
			scriptPath,
			`import { parseArgs } from "${parseArgvPath}";
parseArgs(["src/index.ts", "--outdir", "--format", "esm"]);
`,
			"utf8",
		);

		await assert.rejects(
			execFileAsync(getTsxBin(), [scriptPath], { cwd: tmpDir }),
			(error: NodeJS.ErrnoException) => {
				assert.strictEqual(error.code, 1);
				const stderr = String(error.message ?? "");
				assert.match(stderr, /Output directory required\./);
				return true;
			},
		);
	});

	it("parseArgs exits when --tsconfig value is missing", async () => {
		const tmpDir = await setupTempDir("parse-argv-missing-tsconfig");
		const scriptPath = path.join(tmpDir, "missing-tsconfig.ts");
		const parseArgvPath = path
			.resolve(process.cwd(), "src/cli/lib/parse_argv.ts")
			.replaceAll("\\", "/");

		await fs.writeFile(
			scriptPath,
			`import { parseArgs } from "${parseArgvPath}";
parseArgs(["src/index.ts", "--tsconfig", "--rename"]);
`,
			"utf8",
		);

		await assert.rejects(
			execFileAsync(getTsxBin(), [scriptPath], { cwd: tmpDir }),
			(error: NodeJS.ErrnoException) => {
				assert.strictEqual(error.code, 1);
				const stderr = String(error.message ?? "");
				assert.match(stderr, /Tsconfig path required\./);
				return true;
			},
		);
	});

	it("parseArgs exits when entry is missing", async () => {
		const tmpDir = await setupTempDir("parse-argv-missing-entry");
		const scriptPath = path.join(tmpDir, "missing-entry.ts");
		const parseArgvPath = path
			.resolve(process.cwd(), "src/cli/lib/parse_argv.ts")
			.replaceAll("\\", "/");

		await fs.writeFile(
			scriptPath,
			`import { parseArgs } from "${parseArgvPath}";
parseArgs(["--minify"]);
`,
			"utf8",
		);

		await assert.rejects(
			execFileAsync(getTsxBin(), [scriptPath], { cwd: tmpDir }),
			(error: NodeJS.ErrnoException) => {
				assert.strictEqual(error.code, 1);
				const stderr = String(error.message ?? "");
				assert.match(stderr, /Entry point required/);
				return true;
			},
		);
	});
});
