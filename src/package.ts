import fs from "node:fs";
import path from "node:path";
import { wait } from "./helpers";
import type { Exports, OutFiles } from "./types";

const isCjs = (files: OutFiles) => files.commonjs && files.commonjsTypes;
const isEsm = (files: OutFiles) => files.esm && files.esmTypes;

function getExports(files: OutFiles, isMain = true, outDir?: string): Exports {
	if (!isMain && (!outDir || (outDir && outDir.split(path.sep).length < 2)))
		throw new Error(
			"If it is not main export,required out-dir and sub-dir like `foo/bar`",
		);
	const exportPath = isMain ? "." : `./${outDir?.split(path.sep).slice(-1)[0]}`;
	return isCjs(files) && isEsm(files)
		? {
				[exportPath]: {
					import: {
						default: `./${files.esm as string}`,
						types: `./${files.esmTypes as string}`,
					},
					require: {
						default: `./${files.commonjs as string}`,
						types: `./${files.commonjsTypes as string}`,
					},
				},
			}
		: isCjs(files) && !isEsm(files)
			? {
					[exportPath]: {
						require: {
							default: `./${files.commonjs as string}`,
							types: `./${files.commonjsTypes as string}`,
						},
					},
				}
			: !isCjs(files) && isEsm(files)
				? {
						[exportPath]: {
							import: {
								default: `./${files.esm as string}`,
								types: `./${files.esmTypes as string}`,
							},
						},
					}
				: {};
}

async function writePackage(files: OutFiles, isMain = true, outDir?: string) {
	console.time("Write package.json");
	const pkgFile = path.resolve(process.cwd(), "package.json");
	const _pkgtext = await fs.promises.readFile(pkgFile, "utf8");
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
	await wait(500);
	if (isMain) {
		type = isEsm(files) ? "module" : "commonjs";
	}
	let _main: Record<string, string> = {};
	let _module: Record<string, string> = {};
	let _types: Record<string, string> = {};
	let _exports: Record<string, Exports> = {};
	if (isMain) {
		_main = files.main ? { main: files.main } : {};
		_module = files.module ? { module: files.module } : {};
		_types = files.types ? { types: files.types } : {};
		_exports = { exports: { ...getExports(files, isMain, outDir) } };
	} else {
		_main = main ? { main: main } : {};
		_module = module ? { module: module } : {};
		_types = types ? { types: types } : {};
		const normalizedExports =
			exports && typeof exports === "object" && !Array.isArray(exports)
				? exports
				: exports
					? { ".": exports }
					: {};
		_exports = {
			exports: { ...normalizedExports, ...getExports(files, isMain, outDir) },
		};
	}
	await wait(1000);
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
	await fs.promises.writeFile(pkgFile, JSON.stringify(pkgJson, null, 2));
	console.timeEnd("Write package.json");
}

export default writePackage;
