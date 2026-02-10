import path from "node:path";
import ts from "typescript";

const normalizePathKey = (filePath: string) => {
	const parsed = path.parse(filePath);
	let noExt = path.join(parsed.dir, parsed.name);
	if (parsed.name === "index") {
		noExt = parsed.dir;
	}
	return path.normalize(noExt);
};

const getFileKey = (filePath: string) => normalizePathKey(filePath);

const getModuleKeyFromSpecifier = (
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

function uniqueName() {
	const storedPrefix: Map<string, string> = new Map();

	const obj = {
		setPrefix({ key, value }: { key: string; value: string }) {
			const names: string[] = [];
			let _fix: string | undefined;

			if (storedPrefix.has(key)) {
				console.warn(`${key} already exist`);
				throw new Error();
			} else {
				_fix = value;
				storedPrefix.set(key, value);
			}
			function getName(input: string) {
				const length = names.length;
				const _name = _fix
					? `${_fix}${input}_${length + 1}`
					: `$nyein${input}_${length + 1}`;
				names.push(_name);
				return _name;
			}
			return { getName };
		},
		getPrefix(key: string) {
			if (storedPrefix.has(key)) {
				return storedPrefix.get(key);
			}
		},
	};
	return obj;
}

export { getFileKey, getModuleKeyFromSpecifier, uniqueName };
