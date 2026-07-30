import path from "node:path";
import type ts6 from "@suseejs/ts6";
import type { DependenciesTree, ValidExts } from "@suseejs/type";
import { files } from "../helpers/files.js";
import { utils } from "../helpers/utilities.js";
import { checkDuplicates } from "./duplicates.js";
import { generateGraph } from "./graph.js";

async function generateDependencies(
	entry: string,
	bundledSourceFile: (file: string, content: string) => ts6.SourceFile,
): Promise<DependenciesTree> {
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
	return checkDuplicates(tree, bundledSourceFile);
}

export { generateDependencies };
