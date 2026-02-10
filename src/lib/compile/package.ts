import fs from "node:fs";
import path from "node:path";
import type { Exports, OutFiles } from "@suseejs/types";
import utilities from "@suseejs/utils";
import ts from "typescript";

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
function getExports(files: OutFiles, exportPath: "." | `./${string}`): Exports {
	return isCjs(files) && isEsm(files)
		? {
				[exportPath]: {
					import: {
						default: `./${path.relative(process.cwd(), files.esm as string)}`,
						types: `./${path.relative(process.cwd(), files.esmTypes as string)}`,
					},
					require: {
						default: `./${path.relative(process.cwd(), files.commonjs as string)}`,
						types: `./${path.relative(process.cwd(), files.commonjsTypes as string)}`,
					},
				},
			}
		: isCjs(files) && !isEsm(files)
			? {
					[exportPath]: {
						require: {
							default: `./${path.relative(process.cwd(), files.commonjs as string)}`,
							types: `./${path.relative(process.cwd(), files.commonjsTypes as string)}`,
						},
					},
				}
			: !isCjs(files) && isEsm(files)
				? {
						[exportPath]: {
							import: {
								default: `./${path.relative(process.cwd(), files.esm as string)}`,
								types: `./${path.relative(process.cwd(), files.esmTypes as string)}`,
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
async function writePackage(
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
	await utilities.wait(500);
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
	await utilities.wait(1000);
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
	utilities.writeCompileFile(pkgFile, JSON.stringify(pkgJson, null, 2));
}

export default writePackage;
