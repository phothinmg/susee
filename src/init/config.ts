import resolves from "@phothinmaung/resolves";
import tcolor from "@suseejs/tcolor";
import ts from "typescript";
import type { EntryPoint, SuSeeConfig } from "../types_def.js";
import utilities from "../utils.js";

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
		if (obj.output.target === "nodejs") {
			const value = obj.output.exportPath;

			if (objectStore[value]) {
				duplicateExportPaths.push(`"${value}"`);
			} else {
				objectStore[value] = true;
			}
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
 * Loads and validates the SuSee configuration file from disk.
 *
 * Resolves the config path, imports the config module, validates entry points,
 * and returns a normalized `Config` object with defaults applied.
 *
 * @returns A promise that resolves to the normalized configuration.
 * @throws Exits the process if no configuration file is found.
 */
export default async function getConfig(): Promise<SuSeeConfig> {
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
	const entries: EntryPoint[] = [];
	for (const ent of config.entryPoints) {
		if (ent.output.target === "nodejs") {
			entries.push({
				entry: ent.entry,
				output: {
					target: "nodejs",
					exportPath: ent.output.exportPath,
					format: ent.output.format ?? "esm",
					allowUpdatePackageJson: ent.output.allowUpdatePackageJson ?? true,
				},
				renameDuplicates: ent.renameDuplicates ?? true,
				tsconfigFilePath: ent.tsconfigFilePath,
			});
		} else {
			entries.push({
				entry: ent.entry,
				output: {
					target: "web",
					outFile: ent.output.outFile,
					htmlTemplate: ent.output.htmlTemplate,
				},
				renameDuplicates: ent.renameDuplicates ?? true,
				tsconfigFilePath: ent.tsconfigFilePath,
			});
		}
	}
	return {
		entryPoints: entries,
		plugins: config.plugins ?? [],
	} as SuSeeConfig;
}
