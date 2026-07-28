import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import ts6 from "@typescript/typescript6";

// ----------------------------------------------------Handlers------------------------------------------------------//

function handleImports(node: ts6.Node, processFn: (input: string) => void) {
	// Handle : import declaration
	if (ts6.isImportDeclaration(node) && node.moduleSpecifier) {
		const moduleText = node.moduleSpecifier
			.getText()
			.replace(/^['"`]|['"`]$/g, "");
		processFn(moduleText);
		return;
	} //--
	// Recursively visit all children
	ts6.forEachChild(node, (n) => handleImports(n, processFn));
}
function handleImportEqual(node: ts6.Node, processFn: (input: string) => void) {
	// Handle : import equal declaration
	if (
		ts6.isImportEqualsDeclaration(node) &&
		ts6.isExternalModuleReference(node.moduleReference) &&
		ts6.isStringLiteral(node.moduleReference.expression)
	) {
		const moduleText = node.moduleReference.expression.text;
		processFn(moduleText);
		return;
	} //--
	// Recursively visit all children
	ts6.forEachChild(node, (n) => handleImportEqual(n, processFn));
}

function handleAwaitImport(node: ts6.Node, processFn: (input: string) => void) {
	// Handle : import equal declaration
	if (
		ts6.isAwaitExpression(node) &&
		ts6.isCallExpression(node.expression) &&
		node.expression.expression.kind === ts6.SyntaxKind.ImportKeyword
	) {
		const firstArg = node.expression.arguments[0];
		if (firstArg && ts6.isStringLiteral(firstArg)) {
			processFn(firstArg.text);
		}
		return;
	} //--
	// Recursively visit all children
	ts6.forEachChild(node, (n) => handleAwaitImport(n, processFn));
}

function handleRequire(node: ts6.Node, processFn: (input: string) => void) {
	// Handle : require calls , `var foo = require("foo")`
	// can't handle import equal statement like `import foo = require("foo")`
	if (
		ts6.isCallExpression(node) &&
		ts6.isIdentifier(node.expression) &&
		node.expression.text === "require" &&
		node.arguments.length > 0
	) {
		// if expression callExpression node's text equal to require
		// index 0 of arguments is moduleText
		// I didn't use forEach or for-off loop to avoid multiple processing.
		const firstArg = node.arguments[0];
		if (firstArg && ts6.isStringLiteral(firstArg)) {
			processFn(firstArg.text);
		}
		return; // Skip children for property access require calls
	}

	// Handle : property access like `var foo = require("foo").foo`
	if (
		ts6.isPropertyAccessExpression(node) &&
		ts6.isCallExpression(node.expression) &&
		ts6.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === "require" &&
		node.expression.arguments.length > 0
	) {
		const firstArg = node.expression.arguments[0];
		if (firstArg && ts6.isStringLiteral(firstArg)) {
			processFn(firstArg.text);
		}
		return; // Skip children for property access require calls
	}

	// Recursively visit all children (except for require calls we already processed)
	ts6.forEachChild(node, (n) => handleRequire(n, processFn));
}

function handlers(node: ts6.Node, processFn: (input: string) => void) {
	Promise.all([
		handleImports(node, processFn),
		handleRequire(node, processFn),
		handleImportEqual(node, processFn),
		handleAwaitImport(node, processFn),
	]);
}
// resolved extensions
const allowedExtensions = new Set([
	"js",
	"cjs",
	"mjs",
	"ts",
	"mts",
	"cts",
	"jsx",
	"tsx",
	"json",
]);

function isDir(filePath: string) {
	try {
		const stat = fs.lstatSync(filePath);
		return stat.isDirectory();
	} catch (err) {
		if (
			typeof err === "object" &&
			err !== null &&
			"code" in err &&
			// biome-ignore lint/suspicious/noExplicitAny: for error log only
			(err as any).code === "ENOENT"
		) {
			return false;
		}
		throw err;
	}
}

function getFileName(input: string) {
	const namePart = path.basename(input).split(".")[0];
	return namePart ? namePart.trim() : "";
}
function getExtensionName(input: string) {
	return path.basename(input).split(".")[1]?.trim() || "";
}
function resolveExtension(filePath: string) {
	let result: string | undefined;
	let ext: string | undefined;
	let isDirPath = false;
	// If it's a directory, look for index file
	if (isDir(filePath)) {
		const files = fs.readdirSync(filePath);
		const found = files.find(
			(file) =>
				getFileName(file) === "index" &&
				allowedExtensions.has(getExtensionName(file)),
		);
		if (found) {
			result = path.join(filePath, found);
			ext = getExtensionName(found);
			isDirPath = true;
		} else {
			console.error(
				`${filePath} is a directory and no index file with JS/TS extension found.`,
			); // ----------------------------------------------------------------------------------------------------------//
			process.exit(1);
		}
	} else {
		// Not a directory: try to resolve extension
		const dirName = path.dirname(filePath);
		const baseName = path.basename(filePath);
		const [fileName, extName = ""] = baseName.split(".");
		// const files = fs.globSync(
		//   `${dirName}/**/*.{js,cjs,mjs,ts,cts,mts,jsx,tsx}`
		// );
		const files = ts6.sys.readDirectory(dirName);
		const match = files
			.map((f) => {
				const [name, ext = ""] = path.basename(f).split(".");
				return { name, ext };
			})
			.find((f) => f.name === fileName && allowedExtensions.has(f.ext));
		if (match) {
			if (!extName) {
				result = `${filePath}.${match.ext}`;
				ext = match.ext;
			} else if (extName === match.ext) {
				result = filePath;
				ext = match.ext;
			} else {
				const safeExtName = extName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				result = filePath.replace(
					new RegExp(`\\.${safeExtName}$`),
					`.${match.ext}`,
				);
				ext = match.ext;
			}
		} else {
			// If not found, maybe it's a directory import (e.g. ./lib)
			if (isDir(filePath)) {
				const files = fs.readdirSync(filePath);
				const found = files.find(
					(file) =>
						getFileName(file) === "index" &&
						allowedExtensions.has(getExtensionName(file)),
				);
				if (found) {
					result = path.join(filePath, found);
					ext = getExtensionName(found);
					isDirPath = true;
				}
			}
		}
	}
	if (!(result && ext)) {
		console.error(
			`When checking ${filePath}, it's not a file or file with unsupported extension`,
		);
		process.exit(1);
	}
	return { result, ext, isDirPath };
}
// collecting dependencies

type CollectedObject = {
	file: string;
	index: number;
	importFiles: string[];
};

interface CollectedDepsInfo {
	dependencies: CollectedObject[];
	collectedNpmModules: string[][];
	collectedNodeModules: string[][];
	collectedWarning: string[][];
}
function collectDependencies(
	entry: string,
	collectedDependencies: string[],
	root: string,
): CollectedDepsInfo {
	const dependencies: CollectedObject[] = [];
	const visited = new Set<string>();
	const collectedNpmModules: string[][] = [];
	const collectedNodeModules: string[][] = [];
	const collectedWarning: string[][] = [];
	function visit(file: string, index: number) {
		const absPath = path.resolve(root, file);
		if (visited.has(absPath)) return;
		visited.add(absPath);
		const { result: checkedAbsPath } = resolveExtension(absPath);
		if (!fs.existsSync(checkedAbsPath)) {
			dependencies.push({
				file: absPath,
				index,
				importFiles: [],
			});
			collectedWarning.push([`File not found: ${checkedAbsPath}`]);
		}
		const content = fs.readFileSync(checkedAbsPath, "utf8");
		const sourceFile = ts6.createSourceFile(
			file,
			content,
			ts6.ScriptTarget.Latest,
			true,
		);
		const importFiles: string[] = [];
		const warn: string[] = [];
		const npmModules: string[] = [];
		const nodeModules: string[] = [];
		function processModule(moduleText: string): void {
			// Handle : Imported local dependencies of a file.
			if (moduleText.startsWith(".") || moduleText.startsWith("..")) {
				// Try to resolve as file or directory
				const resolvedModulePath = path.resolve(
					path.dirname(checkedAbsPath),
					moduleText,
				);
				// biome-ignore lint/suspicious/noExplicitAny: just let
				let resolved: Record<string, any> = {};
				try {
					resolved = resolveExtension(resolvedModulePath);
				} catch {
					// fallback: treat as file with extension
					resolved = {
						result: resolvedModulePath,
						ext: path.extname(resolvedModulePath).slice(1),
						isDirPath: false,
					};
				}
				const relImport = path.relative(root, resolved.result);
				importFiles.push(relImport);
			}
			// Handle : Imported dependencies of node builtin modules of a file.
			else if (module.builtinModules.includes(moduleText)) {
				nodeModules.push(moduleText);
			}
			// Handle : Imported npm dependencies of a file
			// Handle : Imported npm dependencies of a file, by checking local package.json
			// currently only check for these dependencies are  installed or not, depend on project's package.json
			// TODO try for provide information such as exported files , to use in bundle process
			else if (collectedDependencies.includes(moduleText)) {
				npmModules.push(moduleText);
			}
			// Unknown dependencies
			// local dependencies are checked before by resolveExtension function.
			// TODO try for analyze these errors and provide analyzed report.
			else {
				warn.push(moduleText);
			}
		}
		ts6.forEachChild(sourceFile, (node) => handlers(node, processModule));
		dependencies.push({
			file: absPath,
			index,
			importFiles,
		});
		collectedNpmModules.push(npmModules);
		collectedNodeModules.push(nodeModules);
		collectedWarning.push(warn);
		// biome-ignore lint/suspicious/useIterableCallbackReturn: Recursively visit local file dependencies
		importFiles.forEach((depFile) => visit(depFile, dependencies.length));
	}
	visit(entry, 0);
	return {
		dependencies,
		collectedNodeModules,
		collectedNpmModules,
		collectedWarning,
	};
}
//
function getPackageJson() {
	const packageContent = fs.readFileSync(
		path.resolve(process.cwd(), "package.json"),
		"utf8",
	);
	const pkg = JSON.parse(packageContent);
	const deps = Object.keys(pkg.dependencies ?? {});
	const devDeps = Object.keys(pkg.devDependencies ?? {});
	return [...deps, ...devDeps];
}
// Topological sort of a directed acyclic graph (DAG)
function topoSort(tree: Record<string, string[]>): string[] {
	const visited = new Set();
	const sorted: string[] = [];
	function visit(node: string) {
		if (visited.has(node)) return;
		visited.add(node);
		(tree[node] || []).forEach(visit);
		sorted.push(node);
	}
	Object.keys(tree).forEach(visit);
	return sorted; // reverse for correct order
}
// Merge an array of string arrays into a single string array
const mergeStringArr = (input: string[][]): string[] => {
	return input.reduce((prev, curr) => prev.concat(curr), []);
};
//  Create a dependency graph from a list of collected dependencies
const createGraph = (deps: CollectedObject[]): Record<string, string[]> => {
	const graph: Record<string, string[]> = {};

	for (const dep of deps) {
		const _name = path.relative(process.cwd(), dep.file);
		graph[_name] = dep.importFiles;
	}
	return graph;
};
//
interface GraphObject {
	/**
	 * Topological sort of a directed acyclic graph (DAG). Returns a list of nodes in topological order.
	 */
	sort: () => string[];
	/** Returns the list of NPM dependencies.*/
	npm: () => string[];
	/** The list of dependencies that are built-in Node.js modules.*/
	node: () => string[];
	/** The dependency graph as an object where the keys are files and the values are arrays of dependencies.  */
	deps: () => Record<string, string[]>;
	/** The collection of warnings */
	warn: () => string[];
}

function generateGraph(entry: string): GraphObject {
	const root = process.cwd();
	const collectedDependencies = getPackageJson();
	const collectedData = collectDependencies(entry, collectedDependencies, root);
	const graphObj = collectedData.dependencies;
	const npmModules = mergeStringArr(collectedData.collectedNpmModules);
	const nodeModules = mergeStringArr(collectedData.collectedNodeModules);
	const warning = mergeStringArr(collectedData.collectedWarning);
	const depsObj = createGraph(graphObj);
	const sortedGraph = topoSort(depsObj);
	return {
		sort: (): string[] => sortedGraph,
		npm: (): string[] => npmModules,
		node: (): string[] => nodeModules,
		deps: (): Record<string, string[]> => depsObj,
		warn: (): string[] => warning,
	};
}

export type { GraphObject };
export { generateGraph };
