import path from "node:path";
import process from "node:process";
import ts6 from "@typescript/typescript6";
import type { SuseePlugins } from "../../types.js";
import { logProfilePhase } from "../profile.js";
import { utils } from "../utilities.js";
import { anonymousHandler } from "./lib/anonymous.js";
import { generateDependencies } from "./lib/dependency.js";
import { duplicateHandlers } from "./lib/duplicate.js";
import { exportDefaultHandler } from "./lib/exportDefault.js";
import { isJSON } from "./lib/helpers.js";
import { removeHandlers } from "./lib/remove.js";
import { jsonModuleHandlers } from "./lib/resolveJSON.js";
import cleanUnusedCode from "./lib/unusedCode.js";

const logBundlerPhase = (entry: string, phase: string, start: bigint) => {
	logProfilePhase(`bundler:${path.basename(entry)}`, phase, start);
};

async function bundler(
	entry: string,
	plugins: SuseePlugins = [],
	warning: boolean = false,
	reName: boolean = true,
): Promise<string> {
	const bundlerStart = process.hrtime.bigint();
	let removedStatements: string[] = [];
	const compilerOptions = ts6.getDefaultCompilerOptions();
	let phaseStart = process.hrtime.bigint();
	const tree = await generateDependencies(entry);
	logBundlerPhase(entry, "generateDependencies", phaseStart);
	// check for warning from generated dependencies graph
	if (warning && tree.warns.length > 0) {
		console.warn(tree.warns.join("\n"));
		process.exit(1);
	}
	let depsFiles = tree.depFiles;
	// 1. Resolve JSON Modules
	if (isJSON(tree)) {
		phaseStart = process.hrtime.bigint();
		depsFiles = await jsonModuleHandlers(depsFiles, compilerOptions);
		logBundlerPhase(entry, "resolveJSON", phaseStart);
	}
	// 2. Parse Dependency Plugins
	if (plugins.length > 0) {
		for (const plugin of plugins) {
			const _plugin = typeof plugin === "function" ? plugin() : plugin;
			if (_plugin.type === "dependency") {
				phaseStart = process.hrtime.bigint();
				if (_plugin.async) {
					depsFiles = await _plugin.func(depsFiles, compilerOptions);
				} else {
					depsFiles = _plugin.func(depsFiles, compilerOptions);
				}
				logBundlerPhase(
					entry,
					`dependencyPlugin:${_plugin.name ?? "anonymous"}`,
					phaseStart,
				);
			}
		}
	}
	// 3. Check for commonjs modules
	const isCommonjs = depsFiles.find((file) => file.moduleType === "cjs");
	if (isCommonjs) {
		console.error(
			`Bundler found commonjs module/modules in dependencies tree.Please use "@suseejs/commonjs-plugin" to solve it.`,
		);
		process.exit(1);
	}
	// 4.  Handling Export Default
	phaseStart = process.hrtime.bigint();
	depsFiles = await exportDefaultHandler(depsFiles, compilerOptions);
	logBundlerPhase(entry, "exportDefault", phaseStart);
	// 5. Handling Anonymous Imports/Exports
	phaseStart = process.hrtime.bigint();
	depsFiles = await anonymousHandler(depsFiles, compilerOptions);
	logBundlerPhase(entry, "anonymous", phaseStart);
	// 6. Handling Duplicated Declarations
	// 6.1 options.reName
	if (reName) {
		phaseStart = process.hrtime.bigint();
		depsFiles = await duplicateHandlers.renamed(depsFiles, compilerOptions);
		logBundlerPhase(entry, "duplicate:renamed", phaseStart);
	}
	// 6.2 !options.reName, for who want to rename manually
	else {
		phaseStart = process.hrtime.bigint();
		depsFiles = await duplicateHandlers.notRenamed(depsFiles, compilerOptions);
		logBundlerPhase(entry, "duplicate:notRenamed", phaseStart);
	}
	// 7. Handling  Remove Imports/Exports
	phaseStart = process.hrtime.bigint();
	const removed = await removeHandlers(removedStatements, compilerOptions);
	// 7.1 Remove Imports
	depsFiles = depsFiles.map(removed[0]);
	// 7.2 Remove Exports
	// Remove Exports from dependency files only
	// not remove exports from entry file
	const deps_files = depsFiles.slice(0, -1).map(removed[1]);
	const mainFile = depsFiles.slice(-1);
	logBundlerPhase(entry, "removeImportsExports", phaseStart);
	// 8. Handling Imported Statements
	// filter removed statements , that not from local like `./` or `../`
	phaseStart = process.hrtime.bigint();
	const regexp =
		/^\s*import(?:[\s\S]*?\sfrom\s+)?["']((?!\.{1,2}\/)[^"']+)["']/;
	removedStatements = removedStatements.filter((i) => regexp.test(i));
	removedStatements = utils.gen.mergeImportsStatement(removedStatements);
	const importStatements = removedStatements.join("\n").trim();
	logBundlerPhase(entry, "mergeImports", phaseStart);
	// 9. Merge all content from dependencies tree
	// 9.1 Merge dependency files content.
	phaseStart = process.hrtime.bigint();
	const depFilesContent = deps_files
		.map((i) => {
			const file = `//${path.relative(process.cwd(), i.file)}`;
			return `${file}\n${i.content}`;
		})
		.join("\n")
		.trim();
	// 9.2 Create entry content
	const mainFileContent = mainFile
		.map((i) => {
			const file = `//${path.relative(process.cwd(), i.file)}`;
			return `${file}\n${i.content}`;
		})
		.join("\n")
		.trim();
	// 9.3 Merge all into one
	// text join order is important here
	// make sure all imports are at the top of file
	let content = `${importStatements}\n${depFilesContent}\n${mainFileContent}`;
	// some additional steps
	// remove ";" that  are remain after removing imports
	content = content.replace(/^s*;\s*$/gm, "").trim();
	logBundlerPhase(entry, "mergeContent", phaseStart);
	// clean unused code
	phaseStart = process.hrtime.bigint();
	content = cleanUnusedCode(content, tree.entry, compilerOptions);
	logBundlerPhase(entry, "cleanUnusedCode", phaseStart);
	// 10. Call pre-process plugins
	if (plugins.length > 0) {
		for (const plugin of plugins) {
			const _plugin = typeof plugin === "function" ? plugin() : plugin;
			if (_plugin.type === "pre-process") {
				phaseStart = process.hrtime.bigint();
				if (_plugin.async) {
					content = await _plugin.func(content, tree.entry);
				} else {
					content = _plugin.func(content, tree.entry);
				}
				logBundlerPhase(
					entry,
					`preProcessPlugin:${_plugin.name ?? "anonymous"}`,
					phaseStart,
				);
			}
		}
	}
	logBundlerPhase(entry, "total", bundlerStart);
	// Returns
	return content;
}
async function bundle(entry: string) {
	return await bundler(entry);
}

export { bundle, bundler };
