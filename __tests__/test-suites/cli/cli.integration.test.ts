import assert from "node:assert";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileExists, setupTempDir } from "../test_helpers.js";

interface CliResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

function getTsxBin() {
	return path.resolve(
		process.cwd(),
		"node_modules",
		".bin",
		process.platform === "win32" ? "tsx.cmd" : "tsx",
	);
}

function runCli(args: string[], cwd: string, input = ""): Promise<CliResult> {
	const cliEntry = path.resolve(process.cwd(), "src/cli/index.ts");
	const tsxBin = getTsxBin();

	return new Promise((resolve, reject) => {
		const child = spawn(tsxBin, [cliEntry, ...args], {
			cwd,
			stdio: "pipe",
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			resolve({ code, stdout, stderr });
		});

		if (input.length > 0) {
			child.stdin.write(input);
		}
		child.stdin.end();
	});
}

async function writeEntryFile(cwd: string) {
	const srcDir = path.join(cwd, "src");
	await fs.mkdir(srcDir, { recursive: true });
	await fs.writeFile(
		path.join(cwd, "package.json"),
		JSON.stringify({ name: "tmp-cli-project", type: "module" }, null, 2),
		"utf8",
	);
	await fs.writeFile(
		path.join(srcDir, "index.ts"),
		"export const answer = 42;\n",
		"utf8",
	);
	await fs.writeFile(
		path.join(cwd, "tsconfig.json"),
		JSON.stringify(
			{
				compilerOptions: {
					target: "ES2022",
					module: "ESNext",
					moduleResolution: "Bundler",
					sourceMap: true,
					declaration: true,
				},
			},
			null,
			2,
		),
		"utf8",
	);
}

describe("CLI integration", () => {
	it("prints help for --help", async () => {
		const cwd = await setupTempDir("cli-help");
		const result = await runCli(["--help"], cwd);

		assert.strictEqual(result.code, 0);
		assert.match(result.stdout, /Usage:/);
		assert.match(result.stdout, /susee build <entry> \[options\]/);
		assert.strictEqual(result.stderr.trim(), "");
	});

	it("prints help for -h", async () => {
		const cwd = await setupTempDir("cli-help-short");
		const result = await runCli(["-h"], cwd);

		assert.strictEqual(result.code, 0);
		assert.match(result.stdout, /Usage:/);
		assert.match(result.stdout, /susee build <entry> \[options\]/);
		assert.strictEqual(result.stderr.trim(), "");
	});

	it("prints help for build --help", async () => {
		const cwd = await setupTempDir("cli-build-help");
		const result = await runCli(["build", "--help"], cwd);

		assert.strictEqual(result.code, 0);
		assert.match(result.stdout, /Usage:/);
		assert.strictEqual(result.stderr.trim(), "");
	});

	it("prints help for build -h", async () => {
		const cwd = await setupTempDir("cli-build-help-short");
		const result = await runCli(["build", "-h"], cwd);

		assert.strictEqual(result.code, 0);
		assert.match(result.stdout, /Usage:/);
		assert.strictEqual(result.stderr.trim(), "");
	});

	it("prints help for build with no entry", async () => {
		const cwd = await setupTempDir("cli-build-no-entry");
		const result = await runCli(["build"], cwd);

		assert.strictEqual(result.code, 0);
		assert.match(result.stdout, /susee build <entry> \[options\]/);
		assert.strictEqual(result.stderr.trim(), "");
	});

	it("exits with code 1 for unknown cli usage", async () => {
		const cwd = await setupTempDir("cli-unknown");
		const result = await runCli(["foo", "bar"], cwd);

		assert.strictEqual(result.code, 1);
		assert.match(result.stderr, /Unknown CLI usage/);
	});

	it("init creates susee.config.ts for TypeScript projects", async () => {
		const cwd = await setupTempDir("cli-init-ts");
		const result = await runCli(["init"], cwd, "y\n");

		assert.strictEqual(result.code, 0);
		assert.strictEqual(
			await fileExists(path.join(cwd, "susee.config.ts")),
			true,
		);
		assert.match(result.stdout, /Welcome to Susee!/);
		assert.match(result.stdout, /Is TypeScript Project\(y\/n\)/);
		assert.match(result.stdout, /susee\.config\.ts/);
		assert.match(result.stdout, /is created at project root/);
	});

	it("init creates susee.config.js for esm JavaScript projects", async () => {
		const cwd = await setupTempDir("cli-init-js-esm");
		await fs.writeFile(
			path.join(cwd, "package.json"),
			JSON.stringify({ name: "tmp", type: "module" }, null, 2),
			"utf8",
		);

		const result = await runCli(["init"], cwd, "n\n");

		assert.strictEqual(result.code, 0);
		assert.strictEqual(
			await fileExists(path.join(cwd, "susee.config.js")),
			true,
		);
		assert.match(result.stdout, /susee\.config\.js/);
		assert.match(result.stdout, /is created at project root/);
	});

	it("init creates susee.config.mjs for commonjs JavaScript projects", async () => {
		const cwd = await setupTempDir("cli-init-js-cjs");
		await fs.writeFile(
			path.join(cwd, "package.json"),
			JSON.stringify({ name: "tmp" }, null, 2),
			"utf8",
		);

		const result = await runCli(["init"], cwd, "n\n");

		assert.strictEqual(result.code, 0);
		assert.strictEqual(
			await fileExists(path.join(cwd, "susee.config.mjs")),
			true,
		);
		assert.match(result.stdout, /susee\.config\.mjs/);
		assert.match(result.stdout, /is created at project root/);
	});

	it("build command compiles entry with explicit flags", async () => {
		const cwd = await setupTempDir("cli-build-args");
		await writeEntryFile(cwd);

		const result = await runCli(
			[
				"build",
				"src/index.ts",
				"--outdir",
				"dist-custom",
				"--format",
				"commonjs",
			],
			cwd,
		);

		assert.strictEqual(result.code, 0);
		assert.strictEqual(
			await fileExists(path.join(cwd, "dist-custom", "index.cjs")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(cwd, "dist-custom", "index.cjs.map")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(cwd, "dist-custom", "index.d.cts")),
			true,
		);
		assert.strictEqual(result.stderr.trim(), "");
	});

	it("default invocation builds from susee.config.js", async () => {
		const cwd = await setupTempDir("cli-default-build");
		await writeEntryFile(cwd);
		await fs.writeFile(
			path.join(cwd, "susee.config.js"),
			`export default {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
  ],
};
`,
			"utf8",
		);

		const result = await runCli([], cwd);

		assert.strictEqual(result.code, 0);
		assert.strictEqual(
			await fileExists(path.join(cwd, "dist", "index.mjs")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(cwd, "dist", "index.cjs")),
			true,
		);
		assert.strictEqual(result.stderr.trim(), "");
	});
});
