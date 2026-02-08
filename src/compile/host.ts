import ts from "typescript";

const createHost = (
	sourceCode: string,
	fileName: string,
): {
	createdFiles: Record<string, string>;
	host: ts.CompilerHost;
} => {
	const createdFiles: Record<string, string> = {};
	const host: ts.CompilerHost = {
		getSourceFile: (file, languageVersion) => {
			if (file === fileName) {
				return ts.createSourceFile(file, sourceCode, languageVersion);
			}
			return undefined;
		},
		writeFile: (fileName, contents) => {
			createdFiles[fileName] = contents;
		},
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getCurrentDirectory: () => "",
		getDirectories: () => [],
		fileExists: (file) => file === fileName,
		readFile: (file) => (file === fileName ? sourceCode : undefined),
		getCanonicalFileName: (file) => file,
		useCaseSensitiveFileNames: () => true,
		getNewLine: () => "\n",
	};
	return { createdFiles, host };
};

export default createHost;
