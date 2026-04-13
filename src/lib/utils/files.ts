import fs from "node:fs";
import path from "node:path";
import type { Exports, OutFiles } from "susee-types";
import ts from "typescript";

namespace files {
	export const resolvePath = ts.sys.resolvePath;
	export const fileExists = ts.sys.fileExists;
	export const directoryExists = ts.sys.directoryExists;
	export const createDirectory = ts.sys.createDirectory;
	export const readDirectory = ts.sys.readDirectory;
	export function emitError(message?: string, options?: ErrorOptions): Error {
		return new Error(message, options);
	}
	export function deleteFile(filePath: string) {
		filePath = resolvePath(filePath);
		if (fileExists(filePath) && typeof ts.sys.deleteFile === "function") {
			ts.sys.deleteFile(filePath);
		}
	}
	export async function clearFolder(folderPath: string) {
		folderPath = path.resolve(process.cwd(), folderPath);
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
	export async function writeFile(
		file: string,
		content: string,
	): Promise<void> {
		const filePath = ts.sys.resolvePath(file);
		const dir = path.dirname(filePath);
		if (!ts.sys.directoryExists(dir)) {
			await fs.promises.mkdir(dir, { recursive: true });
		}
		await fs.promises.writeFile(filePath, content);
	}
	export function readFile(filePath: string): string {
		const resolvedFilePath = resolvePath(filePath);
		if (!fileExists(resolvedFilePath))
			throw emitError(`${filePath} does not exist.`);
		const content = ts.sys.readFile(resolvedFilePath, "utf8");
		if (content) {
			return content;
		} else {
			console.warn(`When reading ${filePath} received content is blank.`);
			return "";
		}
	}
	// -------------------------------------------------------------------------
	const isCjs = (files: OutFiles) => files.commonjs && files.commonjsTypes;
	const isEsm = (files: OutFiles) => files.esm && files.esmTypes;
	/**
	 * Builds a package exports mapping for the given output files and export path.
	 *
	 * Produces the appropriate export shape based on whether CommonJS and/or ESM
	 * artifacts are present, including their default entry points and type
	 * definitions. If neither format is available, returns an empty object.
	 *
	 * @param files - The build output file paths for CommonJS/ESM and their types.
	 * @param exportPath - The subpath export key (e.g. "." or "./feature").
	 * @returns A {@link Exports} object describing the package exports map.
	 */
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
	/**
	 * Writes an updated `package.json` based on output files and export path.
	 *
	 * Determines module type (ESM/CommonJS), adjusts `main`, `module`, `types`,
	 * and `exports` fields, and preserves other existing fields from the
	 * current `package.json`.
	 *
	 * @param files - The generated output files used to populate entry points.
	 * @param exportPath - The export path for subpath exports; "." denotes main export.
	 */
	export async function writePackage(
		files: OutFiles,
		exportPath: "." | `./${string}`,
		// isMain: boolean,
	) {
		let isMain = true;
		if (exportPath !== ".") {
			isMain = false;
		}
		const pkgFile = ts.sys.resolvePath("package.json");
		const _pkgtext = fs.readFileSync(pkgFile, "utf8");
		const pkgtext = JSON.parse(_pkgtext);
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
