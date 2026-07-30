import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { generateGraph } from "../../src/dependencies/graph.js";

function writeFile(filePath: string, content: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, "utf8");
}

function withTempProject(run: (tempDir: string) => void): void {
	const originalCwd = process.cwd();
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "suseejs-graph-"));

	try {
		run(tempDir);
	} finally {
		process.chdir(originalCwd);
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

describe("generateGraph", () => {
	it("collects local, node, npm and unknown dependencies", () => {
		withTempProject((tempDir) => {
			writeFile(
				path.join(tempDir, "package.json"),
				JSON.stringify(
					{
						name: "tmp-graph-project",
						version: "1.0.0",
						dependencies: {
							typescript: "^6.0.0",
						},
					},
					null,
					2,
				),
			);

			writeFile(
				path.join(tempDir, "src", "entry.ts"),
				[
					"import fs from 'fs';",
					"import ts from 'typescript';",
					"import helper from './lib';",
					"import equalImport = require('./eq');",
					"const util = require('./util');",
					"const pathMod = require('path');",
					"async function load() {",
					"  const dynamicMod = await import('./dynamic');",
					"  return dynamicMod;",
					"}",
					"import unknown from 'not-installed';",
					"export { fs, ts, helper, equalImport, util, pathMod, load, unknown };",
				].join("\n"),
			);
			writeFile(path.join(tempDir, "src", "util.ts"), "export default 1;");
			writeFile(path.join(tempDir, "src", "dynamic.ts"), "export default 2;");
			writeFile(path.join(tempDir, "src", "eq.ts"), "export = 3;");
			writeFile(
				path.join(tempDir, "src", "lib", "index.ts"),
				"export default 'lib';",
			);

			process.chdir(tempDir);
			const graph = generateGraph("src/entry.ts");

			const deps = graph.deps();
			const entryDeps = deps["src/entry.ts"];
			assert.ok(entryDeps);
			assert.ok(entryDeps.includes("src/lib/index.ts"));
			assert.ok(entryDeps.includes("src/util.ts"));
			assert.ok(entryDeps.includes("src/dynamic.ts"));
			assert.ok(entryDeps.includes("src/eq.ts"));

			const npm = graph.npm();
			assert.ok(npm.includes("typescript"));

			const node = graph.node();
			assert.ok(node.includes("fs"));
			assert.ok(node.includes("path"));

			const warning = graph.warn();
			assert.ok(warning.includes("not-installed"));

			const sorted = graph.sort();
			assert.ok(sorted.includes("src/entry.ts"));
			assert.ok(sorted.includes("src/util.ts"));
			assert.ok(sorted.includes("src/lib/index.ts"));
			assert.ok(sorted.indexOf("src/util.ts") < sorted.indexOf("src/entry.ts"));
		});
	});

	it("handles entry path without file extension", () => {
		withTempProject((tempDir) => {
			writeFile(
				path.join(tempDir, "package.json"),
				JSON.stringify({ name: "tmp", version: "1.0.0" }, null, 2),
			);
			writeFile(
				path.join(tempDir, "src", "entry.ts"),
				"import './dep'; export const ok = true;",
			);
			writeFile(path.join(tempDir, "src", "dep.ts"), "export const dep = 1;");

			process.chdir(tempDir);
			const graph = generateGraph("src/entry");

			const deps = graph.deps();
			assert.ok(deps["src/entry"]);
			assert.ok(deps["src/entry"].includes("src/dep.ts"));
			assert.deepStrictEqual(graph.warn(), []);
		});
	});

	it("preserves duplicates in npm and node collections", () => {
		withTempProject((tempDir) => {
			writeFile(
				path.join(tempDir, "package.json"),
				JSON.stringify(
					{
						name: "tmp-duplicates",
						version: "1.0.0",
						dependencies: {
							typescript: "^6.0.0",
						},
					},
					null,
					2,
				),
			);

			writeFile(
				path.join(tempDir, "src", "entry.ts"),
				[
					"import fs from 'fs';",
					"import tsA from 'typescript';",
					"import tsB from 'typescript';",
					"import './a';",
					"export { fs, tsA, tsB };",
				].join("\n"),
			);
			writeFile(
				path.join(tempDir, "src", "a.ts"),
				"import fs from 'fs'; export const a = fs;",
			);

			process.chdir(tempDir);
			const graph = generateGraph("src/entry.ts");

			const npm = graph.npm();
			assert.strictEqual(npm.filter((name) => name === "typescript").length, 2);

			const node = graph.node();
			assert.strictEqual(node.filter((name) => name === "fs").length, 2);
		});
	});
});
