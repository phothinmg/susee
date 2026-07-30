// cSpell:disable

import tcolor from "@suseejs/color";
import ts6 from "@suseejs/ts6";
import type { DependenciesTree, DepsFile } from "@suseejs/type";

type DuplicateDeclarationLocation = {
	file: string;
	line: number;
	column: number;
};

type DuplicateNameMap = Map<string, Set<DuplicateDeclarationLocation>>;

const collectDuplicateDeclarations = (
	deps: DepsFile[],
	bundledSourceFile: (file: string, content: string) => ts6.SourceFile,
) => {
	const duplicateNameMap: DuplicateNameMap = new Map();

	const addDuplicateDeclaration = (
		name: string,
		file: string,
		sourceFile: ts6.SourceFile,
		positionNode: ts6.Node,
	) => {
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(
			positionNode.getStart(sourceFile),
		);
		const location = {
			file,
			line: line + 1,
			column: character + 1,
		};

		if (!duplicateNameMap.has(name)) {
			duplicateNameMap.set(name, new Set([location]));
			return;
		}

		duplicateNameMap.get(name)?.add(location);
	};

	const collectFile = (
		file: string,
		sourceFile: ts6.SourceFile,
		node: ts6.Node,
		isGlobalScope = true,
	) => {
		if (isGlobalScope) {
			if (ts6.isVariableStatement(node)) {
				node.declarationList.declarations.forEach((decl) => {
					if (ts6.isIdentifier(decl.name)) {
						const name = decl.name.text;
						addDuplicateDeclaration(name, file, sourceFile, decl.name);
					}
				});
			} else if (
				ts6.isFunctionDeclaration(node) ||
				ts6.isClassDeclaration(node) ||
				ts6.isEnumDeclaration(node) ||
				ts6.isInterfaceDeclaration(node) ||
				ts6.isTypeAliasDeclaration(node)
			) {
				const name = node.name?.text;
				if (name) {
					addDuplicateDeclaration(name, file, sourceFile, node.name);
				}
			}
		}

		if (
			ts6.isBlock(node) ||
			ts6.isFunctionDeclaration(node) ||
			ts6.isFunctionExpression(node) ||
			ts6.isArrowFunction(node) ||
			ts6.isMethodDeclaration(node) ||
			ts6.isClassDeclaration(node)
		) {
			if (ts6.isBlock(node)) {
				node.statements.forEach((child) =>
					collectFile(file, sourceFile, child, false),
				);
			} else {
				ts6.forEachChild(node, (child) => {
					collectFile(file, sourceFile, child, false);
				});
			}
			return;
		}

		ts6.forEachChild(node, (child) => {
			collectFile(file, sourceFile, child, isGlobalScope);
		});
	};

	for (const dep of deps) {
		const sourceFile = bundledSourceFile(dep.file, dep.content);
		collectFile(dep.file, sourceFile, sourceFile, true);
	}

	return duplicateNameMap;
};

const checkDuplicates = (
	tree: DependenciesTree,
	bundledSourceFile: (file: string, content: string) => ts6.SourceFile,
) => {
	let _err = false;
	const duplicateNameMap = collectDuplicateDeclarations(
		tree.depFiles,
		bundledSourceFile,
	);
	duplicateNameMap.forEach((files, name) => {
		if (files.size > 1) {
			_err = true;
			console.warn(tcolor.yellow("[susee:error]"));
			console.warn(
				"  Duplicate declarations found in your dependencies tree as follows:",
			);
			console.warn(
				`  - "${tcolor.magenta(name)}" declared in multiple files : `,
			);
			files.forEach((f) =>
				console.warn(`    - ${f.file}:${f.line}:${f.column}`),
			);
			console.info(
				"Please rename these with different names to avoid duplicate declarations.",
			);
		}
	});
	if (_err) {
		process.exit(1);
	}
	return tree;
};

export { checkDuplicates };
