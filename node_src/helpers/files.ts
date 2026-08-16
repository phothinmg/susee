import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import tcolor from "@suseejs/color";

namespace files {
	const root = process.cwd();
	export type OutFiles = {
		commonjs: string | undefined;
		commonjsTypes: string | undefined;
		esm: string | undefined;
		esmTypes: string | undefined;
		main: string | undefined;
		module: string | undefined;
		types: string | undefined;
	};
	export type Exports = Record<
		string,
		{
			import?: { default: string; types: string };
			require?: { default: string; types: string };
		}
	>;
	export function resolvePath(pathStr: string): string {
		return path.resolve(root, pathStr);
	}
	export function relativePath(pathStr: string): string {
		return path.relative(root, pathStr);
	}
	export function joinPath(...paths: string[]): string {
		return path.join(...paths);
	}
	export function existsPath(pathStr: string): boolean {
		return fs.existsSync(resolvePath(pathStr));
	}
	export async function deleteFile(filePath: string): Promise<void> {
		if (existsPath(filePath)) {
			await fs.promises.unlink(filePath);
		}
	}
	export async function readFile(filePath: string): Promise<{
		str: string;
		bytes: number;
	}> {
		if (!existsPath(filePath)) {
			console.error(tcolor.magenta(`> ${filePath} does not exists `));
			process.exit(1);
		}
		filePath = resolvePath(filePath);
		const readContent = await fs.promises.readFile(filePath);
		return {
			str: readContent.toString("utf8"),
			bytes: readContent.byteLength,
		};
	}
	export async function readJsonFile(filePath: string) {
		const read = await readFile(filePath);
		return JSON.parse(read.str);
	}
	export async function createDirectory(dirPath: string): Promise<void> {
		dirPath = resolvePath(dirPath);
		if (!existsPath(dirPath)) {
			await fs.promises.mkdir(dirPath, { recursive: true });
		}
	}
	export function parentPath(filePath: string): string {
		return path.dirname(resolvePath(filePath));
	}
	export async function writeFile(
		filePath: string,
		content: string,
	): Promise<void> {
		if (existsPath(filePath)) await deleteFile(filePath);
		await createDirectory(parentPath(filePath));
		filePath = resolvePath(filePath);
		await fs.promises.writeFile(filePath, content);
	}
	export async function clearFolder(folderPath: string) {
		folderPath = resolvePath(folderPath);
		try {
			const entries = await fs.promises.readdir(folderPath, {
				withFileTypes: true,
			});
			await Promise.all(
				entries.map((entry) =>
					fs.promises.rm(path.join(folderPath, entry.name), {
						recursive: true,
					}),
				),
			);
		} catch (error) {
			// biome-ignore lint/suspicious/noExplicitAny: error code
			if ((error as any).code !== "ENOENT") {
				throw error;
			}
		}
	}
	// -------------------------------------------------------------------------------------------//
	const isCjs = (files: OutFiles) => files.commonjs && files.commonjsTypes;
	const isEsm = (files: OutFiles) => files.esm && files.esmTypes;

	function getExports(
		files: OutFiles,
		exportPath: "." | `./${string}`,
	): Exports {
		return isCjs(files) && isEsm(files)
			? {
					[exportPath]: {
						import: {
							types: `./${path.relative(process.cwd(), files.esmTypes as string)}`,
							default: `./${path.relative(process.cwd(), files.esm as string)}`,
						},
						require: {
							types: `./${path.relative(process.cwd(), files.commonjsTypes as string)}`,
							default: `./${path.relative(process.cwd(), files.commonjs as string)}`,
						},
					},
				}
			: isCjs(files) && !isEsm(files)
				? {
						[exportPath]: {
							require: {
								types: `./${path.relative(process.cwd(), files.commonjsTypes as string)}`,
								default: `./${path.relative(process.cwd(), files.commonjs as string)}`,
							},
						},
					}
				: !isCjs(files) && isEsm(files)
					? {
							[exportPath]: {
								import: {
									types: `./${path.relative(process.cwd(), files.esmTypes as string)}`,
									default: `./${path.relative(process.cwd(), files.esm as string)}`,
								},
							},
						}
					: {};
	}
	export async function writePackageJson(
		files: OutFiles,
		exportPath: "." | `./${string}`,
		// isMain: boolean,
	) {
		let isMain = true;
		if (exportPath !== ".") {
			isMain = false;
		}
		const pkgFile = resolvePath("package.json");
		const pkgtext = await readJsonFile(pkgFile);
		let {
			name,
			version,
			description,
			main,
			module,
			type,
			types,
			exports,
			...rest
		} = pkgtext;
		type = "module";

		let _main: Record<string, string> = {};
		let _module: Record<string, string> = {};
		let _types: Record<string, string> = {};
		let _exports: Record<string, Exports> = {};
		if (isMain) {
			_main = files.main
				? { main: path.relative(process.cwd(), files.main as string) }
				: {};
			_module = files.module
				? { module: path.relative(process.cwd(), files.module as string) }
				: {};
			_types = files.types
				? { types: path.relative(process.cwd(), files.types as string) }
				: {};
			_exports = { exports: { ...getExports(files, exportPath) } };
		} else {
			_main = main ? { main: main } : {};
			_module = module ? { module: module } : {};
			_types = types ? { types: types } : {};
			const normalizedExports =
				exports && typeof exports === "object" && !Array.isArray(exports)
					? { ...exports }
					: {};
			_exports = {
				exports: { ...normalizedExports, ...getExports(files, exportPath) },
			};
		}
		const pkgJson = {
			name,
			version,
			description,
			type,
			..._main,
			..._types,
			..._module,
			..._exports,
			...rest,
		};
		await writeFile(pkgFile, JSON.stringify(pkgJson, null, 2));
	}
}

export { files };
