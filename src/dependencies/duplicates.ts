// cSpell:disable

import tcolor from "@suseejs/color";
import ts6 from "@suseejs/ts6";
import type { DependenciesTree, DepsFile } from "@suseejs/type";

type DuplicateDeclarationLocation = {
	file: string;
	line: number;
	column: number;
};

type DuplicateScopeEntry = {
	name: string;
	locations: Set<DuplicateDeclarationLocation>;
};

type DuplicateNameMap = Map<string, DuplicateScopeEntry>;

const getScopeNodeLabel = (
	sourceFile: ts6.SourceFile,
	node: ts6.Node,
	index: number,
) => {
	if (ts6.isModuleDeclaration(node)) {
		return `namespace:${node.name.getText(sourceFile)}`;
	}

	if (ts6.isClassDeclaration(node)) {
		return `class:${node.name?.text ?? `anonymous-${index}`}`;
	}

	if (ts6.isFunctionDeclaration(node) || ts6.isFunctionExpression(node)) {
		return `function:${node.name?.text ?? `anonymous-${index}`}`;
	}

	if (ts6.isArrowFunction(node)) {
		return `arrow:${index}`;
	}

	if (ts6.isMethodDeclaration(node)) {
		return `method:${node.name.getText(sourceFile)}`;
	}

	if (ts6.isBlock(node)) {
		return `block:${index}`;
	}

	return `${ts6.SyntaxKind[node.kind].toLowerCase()}:${index}`;
};

const getScopeKey = (file: string, scopeStack: string[]) => {
	if (scopeStack.length === 0) {
		return "global";
	}

	return `${file}::${scopeStack.join(" > ")}`;
};

const isScopeNode = (node: ts6.Node) =>
	ts6.isModuleDeclaration(node) ||
	ts6.isClassDeclaration(node) ||
	ts6.isFunctionDeclaration(node) ||
	ts6.isFunctionExpression(node) ||
	ts6.isArrowFunction(node) ||
	ts6.isMethodDeclaration(node) ||
	ts6.isBlock(node);

const collectDeclarationNames = (node: ts6.Node) => {
	if (ts6.isVariableStatement(node)) {
		return node.declarationList.declarations.flatMap((decl) => {
			if (!ts6.isIdentifier(decl.name)) {
				return [];
			}

			return [{ name: decl.name.text, positionNode: decl.name }];
		});
	}

	if (
		ts6.isFunctionDeclaration(node) ||
		ts6.isClassDeclaration(node) ||
		ts6.isEnumDeclaration(node) ||
		ts6.isInterfaceDeclaration(node) ||
		ts6.isTypeAliasDeclaration(node)
	) {
		if (node.name) {
			return [{ name: node.name.text, positionNode: node.name }];
		}
	}

	return [];
};

const collectDuplicateDeclarations = (
	deps: DepsFile[],
	bundledSourceFile: (file: string, content: string) => ts6.SourceFile,
) => {
	const duplicateNameMap: DuplicateNameMap = new Map();

	const addDuplicateDeclaration = (
		scopeKey: string,
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
		const duplicateKey = `${scopeKey}::${name}`;

		if (!duplicateNameMap.has(duplicateKey)) {
			duplicateNameMap.set(duplicateKey, {
				name,
				locations: new Set([location]),
			});
			return;
		}

		duplicateNameMap.get(duplicateKey)?.locations.add(location);
	};

	const collectFile = (
		file: string,
		sourceFile: ts6.SourceFile,
		node: ts6.Node,
		scopeStack: string[] = [],
	) => {
		const scopeKey = getScopeKey(file, scopeStack);

		for (const declaration of collectDeclarationNames(node)) {
			addDuplicateDeclaration(
				scopeKey,
				declaration.name,
				file,
				sourceFile,
				declaration.positionNode,
			);
		}

		if (isScopeNode(node)) {
			const nextScopeStack = [
				...scopeStack,
				getScopeNodeLabel(sourceFile, node, node.getStart(sourceFile)),
			];

			ts6.forEachChild(node, (child) => {
				collectFile(file, sourceFile, child, nextScopeStack);
			});
			return;
		}

		ts6.forEachChild(node, (child) => {
			collectFile(file, sourceFile, child, scopeStack);
		});
	};

	for (const dep of deps) {
		const sourceFile = bundledSourceFile(dep.file, dep.content);
		collectFile(dep.file, sourceFile, sourceFile);
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
	duplicateNameMap.forEach(({ name, locations }) => {
		if (locations.size > 1) {
			_err = true;
			console.warn(tcolor.yellow("[susee:error]"));
			console.warn(
				"  Duplicate declarations found in your dependencies tree as follows:",
			);
			console.warn(
				`  - "${tcolor.magenta(name)}" declared in multiple files : `,
			);
			locations.forEach((f) =>
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
