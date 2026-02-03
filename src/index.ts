import tcolor from "@suseejs/tcolor";
import utils from "@suseejs/utils";
import bundler from "./bundler/index.js";
import Compilers from "./compiler/index.js";
import type { EntryPoint } from "./config.js";
import entry from "./entry/index.js";
import getConfig, { type Config } from "./getConfig.js";
import writePackage from "./package.js";

export async function susee(): Promise<void> {
	const config: Config = await getConfig();
	console.info(tcolor.cyan("Start Bundle"));
	const compile = async (e: EntryPoint) => {
		const target = e.moduleType ? e.moduleType : "esm";
		const configPath = e.tsconfigFilePath;
		const ent = await entry({
			entryPath: e.entry,
			exportPath: e.exportPath,
			configPath: e.tsconfigFilePath,
			nodeEnv: config.nodeEnv,
		});
		const sourceCode: string = await bundler({
			depsFiles: ent.depFiles,
			compilerOptions: ent.generalOptions,
			renameDuplicates: config.renameDuplicates,
		});
		const mdOpts = ent.modOpts;
		const cjsOpts = mdOpts.commonjs();
		const esmOpts = mdOpts.esm();
		const compiler = new Compilers({ target, configPath });
		if (target === "commonjs") {
			await compiler.commonjs(
				sourceCode,
				e.entry,
				cjsOpts.compilerOptions,
				cjsOpts.isMain,
				config.postProcessHooks,
				config.allowUpdatePackageJson,
			);
		} else if (target === "esm") {
			await compiler.esm(
				sourceCode,
				e.entry,
				esmOpts.compilerOptions,
				esmOpts.isMain,
				config.postProcessHooks,
				config.allowUpdatePackageJson,
			);
		} else if (target === "both") {
			await compiler.esm(
				sourceCode,
				e.entry,
				esmOpts.compilerOptions,
				esmOpts.isMain,
				config.postProcessHooks,
				config.allowUpdatePackageJson,
			);
			await utils.wait(1000);
			await compiler.commonjs(
				sourceCode,
				e.entry,
				cjsOpts.compilerOptions,
				cjsOpts.isMain,
				config.postProcessHooks,
				config.allowUpdatePackageJson,
			);
		}
		await utils.wait(1000);
		if (config.allowUpdatePackageJson) {
			await writePackage(compiler.files, e.exportPath);
		}
	};

	for (const entry of config.entryPoints) {
		const entName =
			entry.exportPath === "." ? "main" : entry.exportPath.slice(2);
		await utils.wait(1000);
		console.info(
			tcolor.cyan(`Start ${tcolor.green("->")} "${entName}" export path`),
		);
		await compile(entry);
		console.info(
			tcolor.cyan(`End ${tcolor.green("->")} "${entName}" export path`),
		);
		if (config.entryPoints.indexOf(entry) + 1 < config.entryPoints.length) {
			console.info("-----------------------------------");
		}
	}
	console.info(tcolor.cyan("Finished Bundle"));
}

export default susee;
