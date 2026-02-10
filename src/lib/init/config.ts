import resolves from "@phothinmaung/resolves";
import tcolor from "@suseejs/tcolor";
import type {
	ConfigReturns,
	EntryPoint,
	Point,
	SuSeeConfig,
} from "@suseejs/types";
import utilities from "@suseejs/utils";
import ts from "typescript";

// -------------
const getConfigPath = () => {
	const fileNames = ["susee.config.ts", "susee.config.js", "susee.config.mjs"];
	let configFile: string | undefined;
	for (const file of fileNames) {
		const _file = ts.sys.resolvePath(file);
		if (ts.sys.fileExists(_file)) {
			configFile = _file;
			break;
		}
	}
	return configFile;
};

//---------
function checkEntries(entries: EntryPoint[]) {
	if (entries.length < 1) {
		console.error(
			tcolor.magenta(
				`No entry found in susee.config file, at least one entry required`,
			),
		);
		ts.sys.exit(1);
	}
	const objectStore: Record<string, boolean> = {};
	const duplicateExportPaths: string[] = [];

	for (const obj of entries) {
		const value = obj.exportPath;

		if (objectStore[value]) {
			duplicateExportPaths.push(`"${value}"`);
		} else {
			objectStore[value] = true;
		}
	}
	if (duplicateExportPaths.length > 0) {
		console.error(
			tcolor.magenta(
				`Duplicate export paths/path (${duplicateExportPaths.join(",")}) found in your susee.config file , that will error for bundled output`,
			),
		);
		ts.sys.exit(1);
	}

	for (const obj of entries) {
		if (!ts.sys.fileExists(ts.sys.resolvePath(obj.entry))) {
			console.error(tcolor.magenta(`Entry file ${obj.entry} dose not exists.`));
			ts.sys.exit(1);
		}
	}
}

/**
 * Get SuSee configuration from susee.config file (susee.config.ts, susee.config.js, susee.config.mjs)
 * @returns {Promise<ConfigReturns>} - SuSee configuration
 * @throws {Error} - when no susee.config file found
 */
async function getConfig(): Promise<ConfigReturns> {
	const configPath = getConfigPath();
	if (configPath === undefined) {
		console.error(
			tcolor.magenta(
				`No susee.config file ("susee.config.ts", "susee.config.js", "susee.config.mjs") found`,
			),
		);
		ts.sys.exit(1);
	}
	const _default: { default: SuSeeConfig } = await import(configPath as string);
	const config = _default.default;
	const entryCheck = resolves([[checkEntries, config.entryPoints]]);
	await entryCheck.series();
	await utilities.wait(1000);
	const points: Point[] = [];
	for (const ent of config.entryPoints) {
		const point = {
			entry: ent.entry,
			exportPath: ent.exportPath,
			format: ent.format ?? "esm",
			tsconfigFilePath: ent.tsconfigFilePath ?? undefined,
			renameDuplicates: ent.renameDuplicates ?? true,
			// TODO check for defined out dir here or in config.ts
			outDir: config.outDir ?? "dist",
		} as Point;
		points.push(point);
	}
	return {
		points,
		plugins: config.plugins ?? [],
		allowUpdatePackageJson: config.allowUpdatePackageJson ?? true,
	} as ConfigReturns;
}

export default getConfig;
