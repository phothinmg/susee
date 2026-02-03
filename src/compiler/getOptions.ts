import TsConfig from "@suseejs/tsconfig";
import ts from "typescript";

const getCompilerOptions = (
	exportPath: "." | `./${string}`,
	configPath?: string,
) => {
	const config = new TsConfig(configPath);
	config.addCompilerOptions({ outDir: "dist" });
	config.removeCompilerOption("rootDir");
	const commonjs = () => {
		config.removeCompilerOption("module");
		const _options = config.getCompilerOptions();
		let out_dir = _options.outDir as string;
		let isMain = true;
		if (exportPath !== ".") {
			out_dir = `${out_dir}/${exportPath.slice(2)}`;
			isMain = false;
		}
		const { outDir, module, ...restOptions } = _options;
		const compilerOptions: ts.CompilerOptions = {
			outDir: out_dir,
			module: ts.ModuleKind.CommonJS,
			...restOptions,
		};
		return {
			isMain,
			compilerOptions,
			out_dir,
		};
	};
	const esm = () => {
		const _options = config.getCompilerOptions();
		let out_dir = _options.outDir as string;
		let isMain = true;
		if (exportPath !== ".") {
			out_dir = `${out_dir}/${exportPath.slice(2)}`;
			isMain = false;
		}
		const { outDir, module, ...restOptions } = _options;
		const compilerOptions: ts.CompilerOptions = {
			outDir: out_dir,
			module:
				_options.module && _options.module !== 1
					? _options.module
					: ts.ModuleKind.ES2022,
			...restOptions,
		};
		return {
			isMain,
			compilerOptions,
			out_dir,
		};
	};
	return { commonjs, esm };
};

export default getCompilerOptions;
