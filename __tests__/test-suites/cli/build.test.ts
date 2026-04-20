import assert from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { fileExists, setupTempDir } from "../test_helpers.js";

const execFileAsync = promisify(execFile);

describe("cliBuild", () => {
	it("builds output files when susee.config is present", async () => {
		const tempDir = await setupTempDir("cli-build-ok");
		const entryDir = path.join(tempDir, "src");
		const entryFile = path.join(entryDir, "index.ts");
		const configFile = path.join(tempDir, "susee.config.ts");
		const packageJsonPath = path.join(tempDir, "package.json");
		const scriptPath = path.join(tempDir, "run-build.ts");
		const cliBuildModulePath = path
			.resolve(process.cwd(), "src/cli/build.ts")
			.replaceAll("\\", "/");

		await fs.mkdir(entryDir, { recursive: true });
		await fs.writeFile(entryFile, "export const value = 123;\n", "utf8");
		await fs.writeFile(
			packageJsonPath,
			JSON.stringify({ name: "tmp", type: "module" }, null, 2),
			"utf8",
		);
		await fs.writeFile(
			configFile,
			`import type { SuSeeConfig } from "${path
				.resolve(process.cwd(), "src/lib/suseeConfig.ts")
				.replaceAll("\\", "/")}";

export default {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
  ],
} as SuSeeConfig;
`,
			"utf8",
		);
		await fs.writeFile(
			scriptPath,
			`import { cliBuild } from "${cliBuildModulePath}";

void (async () => {
  await cliBuild();
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
	});

	it("exits with code 1 when no susee.config file exists", async () => {
		const tempDir = await setupTempDir("cli-build-no-config");
		const scriptPath = path.join(tempDir, "run-build.ts");
		const cliBuildModulePath = path
			.resolve(process.cwd(), "src/cli/build.ts")
			.replaceAll("\\", "/");

		await fs.writeFile(
			scriptPath,
			`import { cliBuild } from "${cliBuildModulePath}";

void (async () => {
  await cliBuild();
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
				assert.match(error.stderr ?? "", /No susee\.config file/);
				return true;
			},
		);
	});
});
