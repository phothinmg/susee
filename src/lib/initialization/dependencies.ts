import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import type { DependenciesFile, DependenciesFiles, JSExts } from "susee-types";
import ts from "typescript";

import dependencies from "../dependencies/index.js";
import { checks } from "../utils/checks.js";

async function fileSizes(path: string) {
	const s = await fs.promises.stat(path);
	const logical = s.size; // bytes in file
	const allocated = s.blocks !== null ? s.blocks * 512 : null; // bytes actually allocated (POSIX)
	return { logical, allocated };
}

const checkExport = (str: string, file: string) => {
	const esmRex = /export default .*/gm;
	const cjsRex = /export = .*/gm;
	const ctsRex = /.cts/g;
	if (str.match(esmRex) || (str.match(cjsRex) && file.match(ctsRex))) {
		return true;
	} else {
		return false;
	}
};

/**
 * Checks if the given code string contains JSX syntax.
 * @param code The content of the file as a string.
 * @returns true if the file contains JSX, false otherwise.
 */
function isJsxContent(code: string): boolean {
	const sourceFile = ts.createSourceFile(
		"file.tsx",
		code,
		ts.ScriptTarget.Latest,
		/*setParentNodes*/ true,
		ts.ScriptKind.TSX,
	);

	let containsJsx = false;

	function visitor(node: ts.Node) {
		// Check for JSX Elements, Self Closing Elements, or JSX Fragments
		if (
			ts.isJsxElement(node) ||
			ts.isJsxSelfClosingElement(node) ||
			ts.isJsxFragment(node)
		) {
			containsJsx = true;
			return;
		}
		ts.forEachChild(node, visitor);
	}

	visitor(sourceFile);

	return containsJsx;
}

/**
 * Generates a list of dependency files for a given entry file.
 * The list is sorted based on the mhaehko graph.
 * For each dependency, it resolves the file path, reads the content, checks the export type,
 * and generates a metadata object containing information about the file.
 * The metadata object includes file path, content, length, includeDefExport flag, file size,
 * module type, file extension, and whether the file contains JSX content.
 * The function returns a promise that resolves to an array of these metadata objects.
 * @param entryFile - The file path to the entry file.
 * @returns A promise that resolves to an array of dependency files.
 */
async function generateDependencies(
	entryFile: string,
): Promise<DependenciesFiles> {
	const deps = await dependencies(entryFile);
	const sorted = deps.sort(); // get mhaehko graph
	const _DependenciesFiles: DependenciesFiles = [];

	for (const dep of sorted) {
		const file = ts.sys.resolvePath(dep);
		const content = await fs.promises.readFile(file, "utf8");
		const _ext = path.extname(file) as JSExts;
		const s = await fileSizes(file);
		const length = content.length;
		const includeDefExport = checkExport(content, file);
		const _sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const _moduleTypes = checks.moduleType(_sourceFile, file);
		const _types = _moduleTypes.isCommonJs ? "cjs" : "esm";
		const _files = {
			file,
			content,
			length,
			includeDefExport,
			size: {
				logical: s.logical,
				allocated: s.allocated,
				utf8: new TextEncoder().encode(content).length,
				buffBytes: Buffer.byteLength(content, "utf8"),
			},
			moduleType: _types,
			fileExt: _ext,
			isJsx: isJsxContent(content),
		} as DependenciesFile;
		_DependenciesFiles.push(_files);
	}

	return _DependenciesFiles;
}

export { generateDependencies };
