import path from "node:path";
import process from "node:process";
import type { DependenciesTree, ValidExts } from "../../../types.js";
import { files } from "../../files.js";
import { generateGraph } from "../../graph.js";
import tcolor from "../../tcolor.js";
import { utils } from "../../utilities.js";

const validExtensions = [
	".js",
	".mjs",
	".cjs",
	".ts",
	".mts",
	".cts",
	".tsx",
	".jsx",
	".json",
];

async function generateDependencies(entry: string): Promise<DependenciesTree> {
	const graph = generateGraph(entry);
	const sorted = graph.sort();
	const npm = graph.npm();
	const nodes = graph.node();
	const warns = graph.warn();
	const tree: DependenciesTree = {
		entry,
		npm,
		nodes,
		warns,
		depFiles: [],
	};
	const entryBase = path.basename(entry);
	for (const file of sorted) {
		const fileBase = path.basename(file);
		const fileExt = path.extname(file);
		if (!validExtensions.includes(fileExt)) {
			console.error(
				`Unsupported file extensions "${tcolor.magenta(fileExt)}" found in your dependencies tree.`,
			);
			process.exit(1);
		}
		const read = await files.readFile(file);
		const content = read.str;
		const bytes = read.bytes;
		const mt = utils.checks.moduleType(content, file);
		const moduleType =
			fileExt === ".json" ? "json" : mt.isCommonJs ? "cjs" : "esm";
		const isJsx = utils.checks.isJsxContent(content);
		const isEntry = entryBase === fileBase;
		tree.depFiles.push({
			file,
			content,
			bytes,
			moduleType,
			fileExt: fileExt as ValidExts,
			is_jsx: isJsx,
			is_entry: isEntry,
		});
	}
	return tree;
}

export { generateDependencies };
