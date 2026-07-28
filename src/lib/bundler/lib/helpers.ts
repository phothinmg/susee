import path from "node:path";
import ts6 from "@typescript/typescript6";
import type { DependenciesTree } from "../../../types.js";

export const isJSON = (tree: DependenciesTree): boolean => {
	const json = tree.depFiles.find(
		(file) => file.fileExt === ".json" && file.moduleType === "json",
	);
	return !!json;
};
export const jsonExtToTs = (file: string) => {
	if (path.extname(file) === ".json") {
		return file.replace(/.json/g, ".ts");
	} else {
		return file;
	}
};
const normalizePathKey = (filePath: string) => {
	const parsed = path.parse(filePath);
	let noExt = path.join(parsed.dir, parsed.name);
	if (parsed.name === "index") {
		noExt = parsed.dir;
	}
	return path.normalize(noExt);
};

export const getFileKey = (filePath: string) => normalizePathKey(filePath);

export const getModuleKeyFromSpecifier = (
	moduleSpecifier: ts6.Expression,
	sourceFile: ts6.SourceFile,
	containingFile: string,
) => {
	let spec = "";
	if (ts6.isStringLiteral(moduleSpecifier)) {
		spec = moduleSpecifier.text;
	} else {
		spec = moduleSpecifier.getText(sourceFile).replace(/^['"]|['"]$/g, "");
	}
	if (spec.startsWith(".") || spec.startsWith("/")) {
		const baseDir = path.dirname(containingFile);
		const resolved = path.isAbsolute(containingFile)
			? path.resolve(baseDir, spec)
			: path.normalize(path.join(baseDir, spec));
		return normalizePathKey(resolved);
	}
	return spec;
};
