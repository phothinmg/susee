import assert from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { fileExists, readJson, setupTempDir } from "../test_helpers.js";

const execFileAsync = promisify(execFile);

describe("build", () => {
	it("build(options) compiles entry outputs", async () => {
		const tempDir = await setupTempDir("build-function-options");
		const entryDir = path.join(tempDir, "src");
		const entryFile = path.join(entryDir, "index.ts");
		const packageJsonPath = path.join(tempDir, "package.json");
		const scriptPath = path.join(tempDir, "run-build.ts");
		const buildModulePath = path
			.resolve(process.cwd(), "src/index.ts")
			.replaceAll("\\", "/");

		await fs.mkdir(entryDir, { recursive: true });
		await fs.writeFile(entryFile, "export const value = 456;\n", "utf8");
		await fs.writeFile(
			packageJsonPath,
			JSON.stringify({ name: "tmp-build-options", type: "module" }, null, 2),
			"utf8",
		);
		await fs.writeFile(
			scriptPath,
			`import { build } from "${buildModulePath}";

void (async () => {
  await build({
    entryPoints: [
      {
        entry: "src/index.ts",
        exportPath: ".",
        format: ["esm", "commonjs"],
      },
    ],
    allowUpdatePackageJson: true,
  });
})();
`,
			"utf8",
		);

		await execFileAsync("npx", ["tsx", scriptPath], { cwd: tempDir });

		assert.strictEqual(
			await fileExists(path.join(tempDir, "dist", "index.mjs")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(tempDir, "dist", "index.cjs")),
			true,
		);

		const pkg = await readJson(packageJsonPath);
		assert.strictEqual(pkg.main, "dist/index.cjs");
		assert.strictEqual(pkg.module, "dist/index.mjs");
	});

	it("build() exits with code 1 when no options and no config", async () => {
		const tempDir = await setupTempDir("build-function-no-options");
		const packageJsonPath = path.join(tempDir, "package.json");
		const scriptPath = path.join(tempDir, "run-build.ts");
		const buildModulePath = path
			.resolve(process.cwd(), "src/index.ts")
			.replaceAll("\\", "/");

		await fs.writeFile(
			packageJsonPath,
			JSON.stringify({ name: "tmp-build-no-options", type: "module" }, null, 2),
			"utf8",
		);
		await fs.writeFile(
			scriptPath,
			`import { build } from "${buildModulePath}";

void (async () => {
  await build();
})();
`,
			"utf8",
		);

		await assert.rejects(
			() => execFileAsync("npx", ["tsx", scriptPath], { cwd: tempDir }),
			(err: unknown) => {
				if (!(err instanceof Error)) return false;
				const error = err as Error & { code?: number; stderr?: string };
				assert.strictEqual(error.code, 1);
				assert.match(
					error.stderr ?? "",
					/Required build options or susee config file/,
				);
				return true;
			},
		);
	});
});
