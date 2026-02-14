import { Buffer } from "node:buffer";
import fs from "node:fs";
import dependencies from "@suseejs/dependencies";
import type { DepsFile, DepsFiles } from "@suseejs/types";
import utilities from "@suseejs/utils";
import ts from "typescript";

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
 * Generate dependencies graph for given entry file.
 *
 * This function will return an array of dependencies file objects.
 * Each object will contain the following properties:
 * - file: path to the file
 * - content: content of the file
 * - length: length of the content in bytes
 * - includeDefExport: whether the file includes export default or export = statement
 * - size: an object containing the following properties:
 *   - logical: size of the file in bytes
 *   - allocated: size of the file in bytes on disk
 *   - utf8: size of the file in bytes when encoded in utf8
 *   - buffBytes: size of the file in bytes when encoded in buffer
 *
 * @param {string} entryFile - path to the entry file
 * @returns {Promise<DepsFiles>}
 */
async function generateDependencies(entryFile: string): Promise<DepsFiles> {
	const deps = await dependencies(entryFile);
	const sorted = deps.sort(); // get dependencies graph
	const depsFiles: DepsFiles = [];

	await utilities.wait(1000);

	for (const dep of sorted) {
		const file = ts.sys.resolvePath(dep);
		const content = await fs.promises.readFile(file, "utf8");
		const s = await fileSizes(file);
		const length = content.length;
		const includeDefExport = checkExport(content, file);
		const _sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const _moduleTypes = utilities.checkModuleType(_sourceFile, file);
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
			type: _types,
		} as DepsFile;
		depsFiles.push(_files);
	}

	return depsFiles;
}

export default generateDependencies;
