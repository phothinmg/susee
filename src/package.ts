import type SuSee from "@suseejs/types";
import utils from "@suseejs/utils";

const isCjs = (files: SuSee.OutFiles) => files.commonjs && files.commonjsTypes;
const isEsm = (files: SuSee.OutFiles) => files.esm && files.esmTypes;

function getExports(
	files: SuSee.OutFiles,
	isMain = true,
	outDir?: string,
): SuSee.Exports {
	if (!isMain && (!outDir || (outDir && outDir.split("/").length < 2)))
		throw new Error(
			"If it is not main export,required out-dir and sub-dir like `foo/bar`",
		);
	const exportPath = isMain ? "." : `./${outDir?.split("/").slice(-1)[0]}`;
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

async function writePackage(
	files: SuSee.OutFiles,
	isMain = true,
	outDir?: string,
) {
	console.time("Write package.json");
	const pkgFile = utils.resolvePath("package.json");
	const _pkgtext = utils.readFile(pkgFile);
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
	await utils.wait(500);
	if (isMain) {
		type = isEsm(files) ? "module" : "commonjs";
	}
	let _main: Record<string, string> = {};
	let _module: Record<string, string> = {};
	let _types: Record<string, string> = {};
	let _exports: Record<string, SuSee.Exports> = {};
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
	await utils.wait(1000);
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
	utils.writeFile(pkgFile, JSON.stringify(pkgJson, null, 2));
	console.timeEnd("Write package.json");
}

export default writePackage;
