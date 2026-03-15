import resolves from "@suseejs/resolves";
import type { DependenciesFile, NamesSets } from "@suseejs/types";
import type ts from "typescript";
import type { DepsHooks } from "../calledFunc.js";
import anonymousCallExpressionHandler from "./called.js";
import anonymousExportHandler from "./exports.js";
import anonymousImportHandler from "./imports.js";

const exportDefaultExportNameMap: NamesSets = [];
const exportDefaultImportNameMap: NamesSets = [];

const anonymousHandler = async (
	deps: DependenciesFile[],
	compilerOptions: ts.CompilerOptions,
): Promise<DependenciesFile[]> => {
	const anonymous = resolves([
		[anonymousExportHandler, compilerOptions, exportDefaultExportNameMap],
		[
			anonymousImportHandler,
			compilerOptions,
			exportDefaultExportNameMap,
			exportDefaultImportNameMap,
		],
		[
			anonymousCallExpressionHandler,
			compilerOptions,
			exportDefaultImportNameMap,
		],
	]);
	const anons = await anonymous.concurrent();
	for (const anon of anons) {
		deps = deps.map(anon);
	}
	return deps;
};

function suseeInternalAnonymous(): DepsHooks {
	return {
		type: "deps",
		async: true,
		func: async (depsFiles, compilerOptions, _reName) => {
			return await anonymousHandler(depsFiles, compilerOptions);
		},
	};
}

export default suseeInternalAnonymous;
