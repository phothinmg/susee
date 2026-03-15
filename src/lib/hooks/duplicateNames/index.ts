// cSpell:disable

import resolves from "@phothinmaung/resolves";
import transformFunction from "@suseejs/transformer";
import type {
	BundleHandler,
	DependenciesFile,
	DependencyPlugin,
	DuplicatesNameMap,
	NamesSets,
} from "@suseejs/types";
import ts from "typescript";
import utils from "../../utils.js";
import type { DepsHooks } from "../calledFunc.js";
import callExpression from "./called.js";
import exportExpression from "./exports.js";
import importExpression from "./imports.js";
import updater from "./updater.js";

// construct maps
const namesMap: DuplicatesNameMap = new Map();
const callNameMap: NamesSets = [];
const importNameMap: NamesSets = [];
const exportNameMap: NamesSets = [];

const collector = (compilerOptions: ts.CompilerOptions): BundleHandler => {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			function visitNode(
				node: ts.Node,
				isGlobalScope: boolean = true,
			): ts.Node {
				// Global declarations များကိုသာ collect လုပ်မယ်
				if (isGlobalScope) {
					// Variable statements (const, let, var)
					if (ts.isVariableStatement(node)) {
						node.declarationList.declarations.forEach((decl) => {
							if (ts.isIdentifier(decl.name)) {
								const $name = decl.name.text;
								if (!namesMap.has($name)) {
									namesMap.set($name, new Set([{ file }]));
								} else {
									// biome-ignore  lint/style/noNonNullAssertion : !namesMap.has($name) before
									namesMap.get($name)!.add({ file });
								}
							}
						});
					}
					// Function, Class, Enum, Interface, Type declarations
					else if (
						ts.isFunctionDeclaration(node) ||
						ts.isClassDeclaration(node) ||
						ts.isEnumDeclaration(node) ||
						ts.isInterfaceDeclaration(node) ||
						ts.isTypeAliasDeclaration(node)
					) {
						const $name = node.name?.text;
						if ($name) {
							if (!namesMap.has($name)) {
								namesMap.set($name, new Set([{ file }]));
							} else {
								// biome-ignore  lint/style/noNonNullAssertion : !namesMap.has($name) before
								namesMap.get($name)!.add({ file });
							}
						}
					}
				}

				// Local scope ထဲရောက်သွားတဲ့ node တွေအတွက် recursive visit
				if (
					ts.isBlock(node) ||
					ts.isFunctionDeclaration(node) ||
					ts.isFunctionExpression(node) ||
					ts.isArrowFunction(node) ||
					ts.isMethodDeclaration(node) ||
					ts.isClassDeclaration(node)
				) {
					// Local scope ထဲကို ဝင်သွားပြီဆိုတာနဲ့ isGlobalScope = false
					if (ts.isBlock(node)) {
						ts.visitNodes(node.statements, (child) => visitNode(child, false));
					} else {
						ts.forEachChild(node, (child) => {
							visitNode(child, false);
						});
					}
				} else {
					// Global scope ထဲဆက်ရှိနေတဲ့ node တွေအတွက်
					return ts.visitEachChild(
						node,
						(child) => visitNode(child, isGlobalScope),
						context,
					);
				}
				/* ----------------------Returns for visitNode function------------------------------- */
				return node;
			} // visitNode
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => visitNode(rootNode, true) as ts.SourceFile;
		}; // transformer;
		/* --------------------Returns for main handler function--------------------------------- */
		const _content = transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, ...rest };
	}; // returns
};

async function rename(
	deps: DependenciesFile[],
	compilerOptions: ts.CompilerOptions,
): Promise<DependenciesFile[]> {
	// order is important here
	const duplicates = resolves([
		[collector, compilerOptions],
		[updater, compilerOptions, namesMap, callNameMap],
		[callExpression, compilerOptions, callNameMap, importNameMap],
		[
			exportExpression,
			compilerOptions,
			callNameMap,
			importNameMap,
			exportNameMap,
		],
		[importExpression, compilerOptions, importNameMap, exportNameMap],
		[callExpression, compilerOptions, callNameMap, importNameMap],
		[
			exportExpression,
			compilerOptions,
			callNameMap,
			importNameMap,
			exportNameMap,
		],
	]);
	const duplicate = await duplicates.series();
	for (const func of duplicate) {
		deps = deps.map(func);
	}
	return deps;
}

async function notReName(
	deps: DependenciesFile[],
	compilerOptions: ts.CompilerOptions,
) {
	let _err = false;
	const duplicates = resolves([[collector, namesMap, compilerOptions]]);
	const duplicate = await duplicates.concurrent();
	deps.map(duplicate[0]);
	await utils.wait(1000);
	namesMap.forEach((files, name) => {
		if (files.size > 1) {
			_err = true;
			console.warn(`Name -> ${name} declared in multiple files :`);
			// biome-ignore lint/suspicious/useIterableCallbackReturn : just log warn
			files.forEach((f) => console.warn(`  - ${f.file}`));
		}
	});
	await utils.wait(500);
	if (_err) {
		process.exit(1);
	}
	return deps;
}

export function suseeInternalRenameDuplicate(): DepsHooks {
	return {
		type: "deps",
		async: true,
		func: async (depsFiles, compilerOptions, reName) => {
			if (reName) {
				return await rename(depsFiles, compilerOptions);
			} else {
				return await notReName(depsFiles, compilerOptions);
			}
		},
	};
}
