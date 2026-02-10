import ts from "typescript";

/**
 * Creates a ts.CompilerHost that can be used with the typescript compiler.
 * This host is designed to be used with in-memory compilation and will
 * return the source file for the given fileName and will write all output
 * files to the createdFiles object.
 * @param {string} sourceCode - the source code to compile
 * @param {string} fileName - the name of the file to compile
 * @returns {{createdFiles: Record<string, string>, host: ts.CompilerHost}}
 */
function createHost(
	sourceCode: string,
	fileName: string,
): {
	createdFiles: Record<string, string>;
	host: ts.CompilerHost;
} {
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
}

export default createHost;
