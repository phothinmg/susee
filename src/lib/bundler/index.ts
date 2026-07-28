import path from "node:path";
import process from "node:process";
import ts6 from "@typescript/typescript6";
import type { SuseePlugins } from "../../types.js";
import { utils } from "../utilities.js";
import { anonymousHandler } from "./lib/anonymous.js";
import { generateDependencies } from "./lib/dependency.js";
import { duplicateHandlers } from "./lib/duplicate.js";
import { exportDefaultHandler } from "./lib/exportDefault.js";
import { isJSON } from "./lib/helpers.js";
import { removeHandlers } from "./lib/remove.js";
import { jsonModuleHandlers } from "./lib/resolveJSON.js";
import cleanUnusedCode from "./lib/unusedCode.js";

async function bundler(
	entry: string,
	plugins: SuseePlugins = [],
	warning: boolean = false,
	reName: boolean = true,
): Promise<string> {
	let removedStatements: string[] = [];
	const compilerOptions = ts6.getDefaultCompilerOptions();
	const tree = await generateDependencies(entry);
	// check for warning from generated dependencies graph
	if (warning && tree.warns.length > 0) {
		console.warn(tree.warns.join("\n"));
		process.exit(1);
	}
	let depsFiles = tree.depFiles;
	// 1. Resolve JSON Modules
	if (isJSON(tree)) {
		depsFiles = await jsonModuleHandlers(depsFiles, compilerOptions);
	}
	// 2. Parse Dependency Plugins
	if (plugins.length > 0) {
		for (const plugin of plugins) {
			const _plugin = typeof plugin === "function" ? plugin() : plugin;
			if (_plugin.type === "dependency") {
				if (_plugin.async) {
					depsFiles = await _plugin.func(depsFiles, compilerOptions);
				} else {
					depsFiles = _plugin.func(depsFiles, compilerOptions);
				}
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
	depsFiles = await exportDefaultHandler(depsFiles, compilerOptions);
	// 5. Handling Anonymous Imports/Exports
	depsFiles = await anonymousHandler(depsFiles, compilerOptions);
	// 6. Handling Duplicated Declarations
	// 6.1 options.reName
	if (reName) {
		depsFiles = await duplicateHandlers.renamed(depsFiles, compilerOptions);
	}
	// 6.2 !options.reName, for who want to rename manually
	else {
		depsFiles = await duplicateHandlers.notRenamed(depsFiles, compilerOptions);
	}
	// 7. Handling  Remove Imports/Exports
	const removed = await removeHandlers(removedStatements, compilerOptions);
	// 7.1 Remove Imports
	depsFiles = depsFiles.map(removed[0]);
	// 7.2 Remove Exports
	// Remove Exports from dependency files only
	// not remove exports from entry file
	const deps_files = depsFiles.slice(0, -1).map(removed[1]);
	const mainFile = depsFiles.slice(-1);
	// 8. Handling Imported Statements
	// filter removed statements , that not from local like `./` or `../`
	const regexp =
		/^\s*import(?:[\s\S]*?\sfrom\s+)?["']((?!\.{1,2}\/)[^"']+)["']/;
	removedStatements = removedStatements.filter((i) => regexp.test(i));
	removedStatements = utils.gen.mergeImportsStatement(removedStatements);
	const importStatements = removedStatements.join("\n").trim();
	// 9. Merge all content from dependencies tree
	// 9.1 Merge dependency files content.
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
	// clean unused code
	content = cleanUnusedCode(content, tree.entry, compilerOptions);
	// 10. Call pre-process plugins
	if (plugins.length > 0) {
		for (const plugin of plugins) {
			const _plugin = typeof plugin === "function" ? plugin() : plugin;
			if (_plugin.type === "pre-process") {
				if (_plugin.async) {
					content = await _plugin.func(content, tree.entry);
				} else {
					content = _plugin.func(content, tree.entry);
				}
			}
		}
	}
	// Returns
	return content;
}

export { bundler };
