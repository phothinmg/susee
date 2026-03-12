import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import ts from "typescript";
import Compiler from "../../src/lib/compile/index.js";
import utilities from "../../src/lib/utils.js";

type WriteCall = { file: string; content: string };

type TestUtils = {
	wait: (time: number) => Promise<void>;
	clearFolder: (folderPath: string) => Promise<void>;
	writeCompileFile: (file: string, content: string) => Promise<void>;
};

function createPoint(
	format: "commonjs" | "esm" | "both",
	overrides?: Partial<Record<string, unknown>>,
) {
	return {
		fileName: "src/index.ts",
		exportPath: ".",
		format,
		rename: true,
		outDir: "dist",
		tsOptions: {
			cjs: {
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2020,
				declaration: true,
				outDir: "dist",
			},
			esm: {
				module: ts.ModuleKind.ES2020,
				target: ts.ScriptTarget.ES2020,
				declaration: true,
				outDir: "dist",
			},
			default: {
				module: ts.ModuleKind.ES2020,
				target: ts.ScriptTarget.ES2020,
				declaration: true,
				outDir: "dist",
			},
		},
		depFiles: [],
		plugins: [
			{
				type: "post-process",
				async: false,
				func(content: string) {
					return `/* post-sync */\n${content}`;
				},
			},
			() => ({
				type: "post-process" as const,
				async: true as const,
				async func(content: string) {
					return `${content}\n/* post-async */`;
				},
			}),
		],
		bundledContent: ["const value: number = 1;", "export default value;"].join(
			"\n",
		),
		...overrides,
	};
}

async function flushAsyncWork() {
	await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("Compiler", () => {
	it("compiles both format and writes package update outputs", async () => {
		const writeCalls: WriteCall[] = [];
		const clearedFolders: string[] = [];
		const utils = utilities as unknown as TestUtils;
		const original = {
			wait: utils.wait,
			clearFolder: utils.clearFolder,
			writeCompileFile: utils.writeCompileFile,
		};

		utils.wait = async () => {};
		utils.clearFolder = async (folderPath: string) => {
			clearedFolders.push(folderPath);
		};
		utils.writeCompileFile = async (file: string, content: string) => {
			writeCalls.push({ file: path.normalize(file), content });
		};

		try {
			const compiler = new Compiler({
				points: [createPoint("both") as never],
				allowUpdatePackageJson: true,
			} as never);
			await compiler.compile();
			await flushAsyncWork();

			const outFiles = writeCalls.map((w) => w.file);
			assert.ok(
				outFiles.some((f) => f.endsWith(path.join("dist", "index.mjs"))),
			);
			assert.ok(
				outFiles.some((f) => f.endsWith(path.join("dist", "index.cjs"))),
			);
			assert.ok(
				outFiles.some((f) => f.endsWith(path.join("dist", "index.d.mts"))),
			);
			assert.ok(
				outFiles.some((f) => f.endsWith(path.join("dist", "index.d.cts"))),
			);
			assert.ok(outFiles.some((f) => f.endsWith("package.json")));

			const jsOutput =
				writeCalls.find((w) => w.file.endsWith(path.join("dist", "index.mjs")))
					?.content ?? "";
			assert.match(jsOutput, /\/\* post-sync \*\//);
			assert.match(jsOutput, /\/\* post-async \*\//);
			assert.ok(clearedFolders.length > 0);
		} finally {
			utils.wait = original.wait;
			utils.clearFolder = original.clearFolder;
			utils.writeCompileFile = original.writeCompileFile;
		}
	});

	it("compiles esm and commonjs points without package update", async () => {
		const writeCalls: WriteCall[] = [];
		const clearedFolders: string[] = [];
		const utils = utilities as unknown as TestUtils;
		const original = {
			wait: utils.wait,
			clearFolder: utils.clearFolder,
			writeCompileFile: utils.writeCompileFile,
		};

		utils.wait = async () => {};
		utils.clearFolder = async (folderPath: string) => {
			clearedFolders.push(folderPath);
		};
		utils.writeCompileFile = async (file: string, content: string) => {
			writeCalls.push({ file: path.normalize(file), content });
		};

		try {
			const compiler = new Compiler({
				points: [
					createPoint("esm", {
						fileName: "src/esm-entry.ts",
						exportPath: "./esm-entry",
					}) as never,
					createPoint("commonjs", {
						fileName: "src/cjs-entry.ts",
						exportPath: "./cjs-entry",
					}) as never,
				],
				allowUpdatePackageJson: false,
			} as never);
			await compiler.compile();
			await flushAsyncWork();

			const outFiles = writeCalls.map((w) => w.file);
			assert.ok(outFiles.some((f) => /esm-entry\.mjs$/.test(f)));
			assert.ok(outFiles.some((f) => /cjs-entry\.cjs$/.test(f)));
			assert.ok(!outFiles.some((f) => f.endsWith("package.json")));
			assert.ok(clearedFolders.length >= 2);
		} finally {
			utils.wait = original.wait;
			utils.clearFolder = original.clearFolder;
			utils.writeCompileFile = original.writeCompileFile;
		}
	});
});
