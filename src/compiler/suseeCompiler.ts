import path from "node:path";
import ts6 from "@suseejs/ts6";
export interface CompilerPrams {
	sourceCode: string;
	fileName: string;
	compilerOptions: ts6.CompilerOptions;
	isJsx?: boolean;
}

/**
 * Normalizes TypeScript compiler options when JSX compilation is requested.
 *
 * For JSX input, this validates that the source imports either React runtime
 * modules or the configured `jsxImportSource` runtime package. When validation
 * passes, it enables DOM libs and defaults `jsx` to `ReactJSX` if unset.
 *
 * @param {string} sourceCode - Source text to inspect for JSX runtime imports.
 * @param {ts6.CompilerOptions} compilerOptions - User-provided compiler options.
 * @param {boolean} isJsx - Whether JSX mode is enabled for this compilation.
 * @returns {ts6.CompilerOptions} Compiler options to pass into program creation.
 */
function jsxCompilerOptions(
	sourceCode: string,
	compilerOptions: ts6.CompilerOptions,
	isJsx: boolean,
): ts6.CompilerOptions {
	if (!isJsx) {
		return compilerOptions;
	}

	const reactRegexp =
		/import\s+(?:.*?)\s+from\s+(?:"react"|"react\/.*"|"react-dom\/.*"|"react-dom")/gm;
	if (!reactRegexp.test(sourceCode)) {
		if (!compilerOptions.jsxImportSource) {
			console.error(
				"[jsx-runtime-error]:\nJSX syntax found in bundled code,but its not react runtime,you need to be set jsxImportSource in tsconfig.",
			);
			process.exit(1);
		}

		const txt = compilerOptions.jsxImportSource;
		const pattern = `import\\s+(?:.*?)\\s+from\\s+("${txt}"|"${txt}\\/.*")`;
		const re = new RegExp(pattern, "gm");
		if (!re.test(sourceCode)) {
			console.error(
				"[jsx-runtime-mismatch-error]:\nJSX syntax found in bundled code,but its not react runtime and jsx-runtime from bundled code and jsxImportSource from tsconfig are mismatched.`",
			);
			process.exit(1);
		}
	}

	const { jsx, lib, ...rest } = compilerOptions;
	const _jsx = jsx ?? ts6.JsxEmit.ReactJSX;
	return {
		lib: ["dom", "dom.iterable", "esnext"],
		jsx: _jsx,
		...rest,
	} as ts6.CompilerOptions;
}
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
	host: ts6.CompilerHost;
} {
	const createdFiles: Record<string, string> = {};
	const host: ts6.CompilerHost = {
		getSourceFile: (file, languageVersion) => {
			if (file === fileName) {
				return ts6.createSourceFile(file, sourceCode, languageVersion);
			}
			return undefined;
		},
		writeFile: (fileName, contents) => {
			createdFiles[fileName] = contents;
		},
		getDefaultLibFileName: (options) => ts6.getDefaultLibFilePath(options),
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

function suseeCompiler({
	sourceCode,
	fileName,
	compilerOptions,
	isJsx = false,
}: CompilerPrams) {
	compilerOptions = jsxCompilerOptions(sourceCode, compilerOptions, isJsx);
	// create host
	const _host = createHost(sourceCode, fileName);
	const createdFiles: Record<string, string> = _host.createdFiles;
	const host = _host.host;
	const program = ts6.createProgram([fileName], compilerOptions, host);
	program.emit();
	let dts: string | undefined;
	let map: string | undefined;
	let code: string = "";
	let file_name: string = "";
	let out_dir: string = "";
	for (const key of Object.keys(createdFiles)) {
		if (key.endsWith(".js")) code = createdFiles[key] as string;
		if (key.endsWith(".d.ts")) dts = createdFiles[key] as string;
		if (key.endsWith(".js.map")) map = createdFiles[key] as string;
		file_name = path.basename(key).split(".")[0] as string;
		out_dir = path.dirname(key);
	}
	return { code, file_name, out_dir, dts, map };
}

export { suseeCompiler };
