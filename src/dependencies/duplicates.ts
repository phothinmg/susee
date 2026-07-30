// cSpell:disable

import ts6 from "@suseejs/ts6";
import type {
	DependenciesTree,
	DepsFile,
	DuplicatesNameMap,
} from "@suseejs/type";

const duplicateNameMap: DuplicatesNameMap = new Map();

const collectDuplicateDeclarations = (
	deps: DepsFile[],
	bundledSourceFile: (file: string, content: string) => ts6.SourceFile,
) => {
	const collectFile = (file: string, node: ts6.Node, isGlobalScope = true) => {
		if (isGlobalScope) {
			if (ts6.isVariableStatement(node)) {
				node.declarationList.declarations.forEach((decl) => {
					if (ts6.isIdentifier(decl.name)) {
						const name = decl.name.text;
						if (!duplicateNameMap.has(name)) {
							duplicateNameMap.set(name, new Set([{ file }]));
						} else {
							duplicateNameMap.get(name)?.add({ file });
						}
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
					if (!duplicateNameMap.has(name)) {
						duplicateNameMap.set(name, new Set([{ file }]));
					} else {
						duplicateNameMap.get(name)?.add({ file });
					}
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
				node.statements.forEach((child) => collectFile(file, child, false));
			} else {
				ts6.forEachChild(node, (child) => {
					collectFile(file, child, false);
				});
			}
			return;
		}

		ts6.forEachChild(node, (child) => {
			collectFile(file, child, isGlobalScope);
		});
	};

	for (const dep of deps) {
		const sourceFile = bundledSourceFile(dep.file, dep.content);
		collectFile(dep.file, sourceFile, true);
	}
};

const checkDuplicates = (
	tree: DependenciesTree,
	bundledSourceFile: (file: string, content: string) => ts6.SourceFile,
) => {
	let _err = false;
	collectDuplicateDeclarations(tree.depFiles, bundledSourceFile);
	duplicateNameMap.forEach((files, name) => {
		if (files.size > 1) {
			_err = true;
			console.warn(`Name -> ${name} declared in multiple files : `);
			files.forEach((f) => console.warn(`  - ${f.file}`));
		}
	});
	if (_err) {
		process.exit(1);
	}
	return tree;
};

export { checkDuplicates };
