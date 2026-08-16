import assert from "node:assert";
import { describe, it } from "node:test";
import type { DepsFile } from "@suseejs/type";
import { anonymousHandler } from "../../src/nodejs/bundler/lib/anonymous.js";
import { exportDefaultHandler } from "../../src/nodejs/bundler/lib/exportDefault.js";
import { jsonModuleHandlers } from "../../src/nodejs/bundler/lib/resolveJSON.js";

const jsonFile = "/tmp/project/src/config.json";
const consumerFile = "/tmp/project/src/main.ts";

function createBaseDeps(
	content = "import cfg from './config.json';\n",
): DepsFile[] {
	return [
		{
			file: jsonFile,
			content: JSON.stringify({ app: "bundler", count: 2 }),
			bytes: 30,
			moduleType: "json",
			fileExt: ".json",
			is_jsx: false,
			is_entry: false,
		},
		{
			file: consumerFile,
			content,
			bytes: content.length,
			moduleType: "esm",
			fileExt: ".ts",
			is_jsx: false,
			is_entry: false,
		},
	];
}

describe("jsonModuleHandlers", () => {
	it("converts json dependency into js object module with default export", async () => {
		const deps = createBaseDeps();
		const resolved = await jsonModuleHandlers(deps, {});
		const jsonDep = resolved.find((d) => d.file === jsonFile);

		assert.ok(jsonDep);
		assert.strictEqual(jsonDep?.moduleType, "esm");
		assert.match(jsonDep?.content as string, /const __jsonModule__/);
		assert.match(jsonDep?.content as string, /"app": "bundler"/);
		assert.match(jsonDep?.content as string, /export default __jsonModule__/);
	});

	it("renames default json imports and rewrites their local usages", async () => {
		const deps = createBaseDeps(
			"import cfg from './config.json';\nconsole.log(cfg.app);\n",
		);
		const resolved = await jsonModuleHandlers(deps, {});
		const consumer = resolved.find((d) => d.file === consumerFile);

		assert.ok(consumer);
		assert.match(consumer?.content as string, /import\s+__jsonModule__/);
		assert.match(
			consumer?.content as string,
			/console\.log\(__jsonModule__.*\.app\)/,
		);
		assert.doesNotMatch(consumer?.content as string, /\bcfg\b/);
	});

	it("supports json import attributes and rewrites default binding usages", async () => {
		const deps = createBaseDeps(
			"import cfg from './config.json' with { type: 'json' };\nconsole.log(cfg.app);\n",
		);
		const resolved = await jsonModuleHandlers(deps, {});
		const consumer = resolved.find((d) => d.file === consumerFile);

		assert.ok(consumer);
		assert.match(consumer?.content as string, /import\s+__jsonModule__/);
		assert.match(
			consumer?.content as string,
			/with\s*\{\s*type\s*:\s*["']json["']\s*\}/,
		);
		assert.match(
			consumer?.content as string,
			/console\.log\(__jsonModule__.*\.app\)/,
		);
		assert.doesNotMatch(consumer?.content as string, /\bcfg\b/);
	});

	it("keeps named and namespace json imports unchanged", async () => {
		const deps = createBaseDeps(
			"import * as cfg from './config.json';\nimport { app as appName } from './config.json';\nconsole.log(cfg.count, appName);\n",
		);
		const resolved = await jsonModuleHandlers(deps, {});
		const consumer = resolved.find((d) => d.file === consumerFile);

		assert.ok(consumer);
		assert.match(
			consumer?.content as string,
			/import \* as cfg from '\.\/config\.json'/,
		);
		assert.match(
			consumer?.content as string,
			/import \{ app as appName \} from '\.\/config\.json'/,
		);
	});

	it("keeps require json calls unchanged in importer files", async () => {
		const deps = createBaseDeps(
			"const cfg = require('./config.json');\nmodule.exports = cfg;\n",
		);
		const resolved = await jsonModuleHandlers(deps, {});
		const consumer = resolved.find((d) => d.file === consumerFile);

		assert.ok(consumer);
		assert.match(consumer?.content as string, /require\('\.\/config\.json'\)/);
		assert.match(consumer?.content as string, /module\.exports = cfg/);
	});

	it("returns original deps when no json module exists", async () => {
		const deps: DepsFile[] = [
			{
				file: consumerFile,
				content: "export const ok = true;\n",
				bytes: 24,
				moduleType: "esm",
				fileExt: ".ts",
				is_jsx: false,
				is_entry: false,
			},
		];

		const resolved = await jsonModuleHandlers(deps, {});
		assert.deepStrictEqual(resolved, deps);
	});
});

describe("anonymousHandler", () => {
	it("names anonymous default arrow export", async () => {
		const file = "/tmp/project/src/anon.ts";
		const deps: DepsFile[] = [
			{
				file,
				content: "export default () => 42;\n",
				bytes: 24,
				moduleType: "esm",
				fileExt: ".ts",
				is_jsx: false,
				is_entry: false,
			},
		];

		const resolved = await anonymousHandler(deps, {});
		const anon = resolved[0]?.content as string;

		assert.match(anon, /const susee__anonymous__anon_\d+ = \(\) => 42/);
		assert.match(anon, /export default susee__anonymous__anon_\d+/);
	});
});

describe("exportDefaultHandler", () => {
	it("renames default-exported symbol and updates local usages", async () => {
		const file = "/tmp/project/src/exp.ts";
		const deps: DepsFile[] = [
			{
				file,
				content: "export default function hello() { return 1; }\nhello();\n",
				bytes: 57,
				moduleType: "esm",
				fileExt: ".ts",
				is_jsx: false,
				is_entry: false,
			},
		];

		const resolved = await exportDefaultHandler(deps, {});
		const exp = resolved[0]?.content as string;

		assert.match(
			exp,
			/export default function susee__exportDefault__hello_\d+/,
		);
		assert.match(exp, /susee__exportDefault__hello_\d+\(\)/);
		assert.doesNotMatch(exp, /\bhello\(\)/);
	});
});
