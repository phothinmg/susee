import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { before, describe, it } from "node:test";
import { suseeTerser } from "@suseejs/terser-plugin";
import { fileExists, readJson, setupTempDir } from "../test_helpers.js";

const repoRoot = process.cwd();

async function withCwd<T>(cwd: string, fn: () => Promise<T>) {
	const old = process.cwd();
	process.chdir(cwd);
	try {
		return await fn();
	} finally {
		process.chdir(old);
	}
}

async function writeProjectFiles(cwd: string, source = "ORIGINAL_VALUE") {
	const srcDir = path.join(cwd, "src");
	await fs.mkdir(srcDir, { recursive: true });
	await fs.writeFile(
		path.join(cwd, "package.json"),
		JSON.stringify({ name: "tmp-cli-compiler", type: "module" }, null, 2),
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
	await fs.writeFile(
		path.join(srcDir, "index.ts"),
		`export const message = \"${source}\";\n`,
		"utf8",
	);
}

async function loadCliCompiler() {
	const modulePath = pathToFileURL(
		path.resolve(repoRoot, "src/cli/cli.ts"),
	).href;
	const uniquePath = `${modulePath}?v=${Date.now()}-${Math.random()}`;
	const mod = (await import(uniquePath)) as {
		cliCompiler: { compile: (opts: unknown) => Promise<void> };
	};
	return mod.cliCompiler;
}

describe("CliCompiler", () => {
	let cwd = "";

	before(async () => {
		cwd = await setupTempDir("cli-compiler-suite");
		await withCwd(cwd, async () => {
			await loadCliCompiler();
		});
	});

	it("compiles commonjs, applies post-process plugins, and updates package.json", async () => {
		await writeProjectFiles(cwd);

		const entry = path.join(cwd, "src", "index.ts");
		const outDir = "dist";

		await withCwd(cwd, async () => {
			const cliCompiler = await loadCliCompiler();
			const syncPlugin = {
				type: "post-process",
				async: false,
				func(code: string) {
					return code.replace("ORIGINAL_VALUE", "SYNC_PLUGIN_VALUE");
				},
			};
			const asyncPlugin = {
				type: "post-process",
				async: true,
				async func(code: string) {
					return `${code}\nexport const asyncValue = \"ASYNC_PLUGIN_VALUE\";`;
				},
			};
			const options = {
				entry,
				outDir,
				format: "commonjs" as const,
				tsconfig: path.join(cwd, "tsconfig.json"),
				rename: true,
				allowUpdate: true,
				minify: true,
				warning: false,
				plugins: [suseeTerser, syncPlugin, asyncPlugin],
			};

			await cliCompiler.compile(options);

			assert.strictEqual(
				options.plugins.filter((plugin) => plugin === suseeTerser).length,
				1,
			);
		});

		assert.strictEqual(
			await fileExists(path.join(cwd, outDir, "index.cjs")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(cwd, outDir, "index.d.cts")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(cwd, outDir, "index.cjs.map")),
			true,
		);

		const code = await fs.readFile(path.join(cwd, outDir, "index.cjs"), "utf8");
		assert.match(code, /SYNC_PLUGIN_VALUE/);
		assert.match(code, /ASYNC_PLUGIN_VALUE/);

		const pkg = await readJson(path.join(cwd, "package.json"));
		assert.strictEqual(pkg.main, "dist/index.cjs");
		assert.strictEqual(pkg.types, "dist/index.d.cts");
	});

	it("compiles esm with function plugins and updates module field", async () => {
		await writeProjectFiles(cwd);

		const entry = path.join(cwd, "src", "index.ts");
		const outDir = "dist";

		await withCwd(cwd, async () => {
			const cliCompiler = await loadCliCompiler();
			const pluginFactory = () => ({
				type: "post-process" as const,
				async: false,
				func(code: string) {
					return `${code}\nexport const fromFactory = \"FACTORY_PLUGIN\";`;
				},
			});

			await cliCompiler.compile({
				entry,
				outDir,
				format: "esm",
				tsconfig: path.join(cwd, "tsconfig.json"),
				rename: true,
				allowUpdate: true,
				minify: false,
				warning: false,
				plugins: [pluginFactory],
			});
		});

		assert.strictEqual(
			await fileExists(path.join(cwd, outDir, "index.mjs")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(cwd, outDir, "index.d.mts")),
			true,
		);
		assert.strictEqual(
			await fileExists(path.join(cwd, outDir, "index.mjs.map")),
			true,
		);

		const code = await fs.readFile(path.join(cwd, outDir, "index.mjs"), "utf8");
		assert.match(code, /FACTORY_PLUGIN/);
		assert.match(code, /index\.mjs\.map/);

		const pkg = await readJson(path.join(cwd, "package.json"));
		assert.strictEqual(pkg.module, "dist/index.mjs");
	});

	it("does not update package.json when allowUpdate is false", async () => {
		await writeProjectFiles(cwd);

		const entry = path.join(cwd, "src", "index.ts");
		const outDir = "dist";

		await withCwd(cwd, async () => {
			const cliCompiler = await loadCliCompiler();
			await cliCompiler.compile({
				entry,
				outDir,
				format: "commonjs",
				tsconfig: path.join(cwd, "tsconfig.json"),
				rename: true,
				allowUpdate: false,
				minify: false,
				warning: false,
				plugins: [],
			});
		});

		assert.strictEqual(
			await fileExists(path.join(cwd, outDir, "index.cjs")),
			true,
		);
		const pkg = await readJson(path.join(cwd, "package.json"));
		assert.strictEqual(pkg.main, undefined);
		assert.strictEqual(pkg.module, undefined);
		assert.strictEqual(pkg.types, undefined);
	});
});
