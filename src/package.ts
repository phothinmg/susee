import path from "node:path";
import type SuSee from "@suseejs/types";
import utils from "@suseejs/utils";

const isCjs = (files: SuSee.OutFiles) => files.commonjs && files.commonjsTypes;
const isEsm = (files: SuSee.OutFiles) => files.esm && files.esmTypes;

function getExports(
	files: SuSee.OutFiles,
	exportPath: "." | `./${string}`,
): SuSee.Exports {
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

async function writePackage(
	files: SuSee.OutFiles,
	exportPath: "." | `./${string}`,
	// isMain: boolean,
) {
	let isMain = true;
	if (exportPath !== ".") {
		isMain = false;
	}
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
	type = isEsm(files) ? "module" : "commonjs";

	let _main: Record<string, string> = {};
	let _module: Record<string, string> = {};
	let _types: Record<string, string> = {};
	let _exports: Record<string, SuSee.Exports> = {};
	// if (files.main) _main = { main: path.relative(process.cwd(), files.main) };
	// if (files.module)
	//   _module = { module: path.relative(process.cwd(), files.module) };
	// if (files.types)
	//   _types = { types: path.relative(process.cwd(), files.types) };
	// _exports = {
	//   exports: {
	//     ...getExports(files, exportPath),
	//   },
	// };

	// if (files.commonjs && files.commonjsTypes) {
	//   _require = {
	//     require: {
	//       default: path.relative(process.cwd(), files.commonjs),
	//       types: path.relative(process.cwd(), files.commonjsTypes),
	//     },
	//   };
	// }

	// if (files.esm && files.esmTypes) {
	//   _import = {
	//     import: {
	//       default: path.relative(process.cwd(), files.esm),
	//       types: path.relative(process.cwd(), files.esmTypes),
	//     },
	//   };
	// }
	// _exports = {
	//   [exportPath]: {
	//     ..._require,
	//     ..._import,
	//   },
	// };
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
}

export default writePackage;
