import path from "node:path";
import ts from "typescript";

export const normalizePathKey = (filePath: string) => {
	const parsed = path.parse(filePath);
	let noExt = path.join(parsed.dir, parsed.name);
	if (parsed.name === "index") {
		noExt = parsed.dir;
	}
	return path.normalize(noExt);
};

export const getFileKey = (filePath: string) => normalizePathKey(filePath);

export const getModuleKeyFromSpecifier = (
	moduleSpecifier: ts.Expression,
	sourceFile: ts.SourceFile,
	containingFile: string,
) => {
	let spec = "";
	if (ts.isStringLiteral(moduleSpecifier)) {
		spec = moduleSpecifier.text;
	} else {
		spec = moduleSpecifier.getText(sourceFile).replace(/^['"]|['"]$/g, "");
	}
	if (spec.startsWith(".") || spec.startsWith("/")) {
		const baseDir = path.dirname(containingFile);
		return normalizePathKey(path.resolve(baseDir, spec));
	}
	return spec;
};
