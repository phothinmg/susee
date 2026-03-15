import transformFunction from "@suseejs/transformer";
import type {
	BundleHandler,
	DependenciesFile,
	DuplicatesNameMap,
	NamesSets,
} from "@suseejs/types";
import utils from "@suseejs/utils";
import ts from "typescript";

const prefixKey = "DuplicateName";

const dupName = utils.uniqueName().setPrefix({
	key: prefixKey,
	value: "_dupName_",
});

const duplicateUpdater = (
	compilerOptions: ts.CompilerOptions,
	namesMap: DuplicatesNameMap,
	callNameMap: NamesSets,
): BundleHandler => {
	return ({ file, content, ...rest }: DependenciesFile): DependenciesFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const { factory } = context;
			const visitor = (node: ts.Node): ts.Node => {
				if (ts.isVariableStatement(node)) {
					const newDeclarations = node.declarationList.declarations.map(
						(decl) => {
							if (ts.isIdentifier(decl.name)) {
								const base = decl.name.text;
								// biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
								if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
									const newName = dupName.getName(prefixKey, base);
									callNameMap.push({ base, file, newName });
									return factory.updateVariableDeclaration(
										decl,
										factory.createIdentifier(newName),
										decl.exclamationToken,
										decl.type,
										decl.initializer,
									);
								}
							}
							return decl;
						},
					);
					const newDeclList = factory.updateVariableDeclarationList(
						node.declarationList,
						newDeclarations,
					);
					return factory.updateVariableStatement(
						node,
						node.modifiers,
						newDeclList,
					);
				} else if (ts.isFunctionDeclaration(node)) {
					if (node.name && ts.isIdentifier(node.name)) {
						const base = node.name.text;
						// biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
						if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
							const newName = dupName.getName(prefixKey, base);
							callNameMap.push({ base, file, newName });
							return factory.updateFunctionDeclaration(
								node,
								node.modifiers,
								node.asteriskToken,
								factory.createIdentifier(newName),
								node.typeParameters,
								node.parameters,
								node.type,
								node.body,
							);
						}
					}
				} else if (ts.isClassDeclaration(node)) {
					if (node.name && ts.isIdentifier(node.name)) {
						const base = node.name.text;
						// biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
						if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
							const newName = dupName.getName(prefixKey, base);
							callNameMap.push({ base, file, newName });
							return factory.updateClassDeclaration(
								node,
								node.modifiers,
								factory.createIdentifier(newName),
								node.typeParameters,
								node.heritageClauses,
								node.members,
							);
						}
					}
				}
				/* ----------------------Returns for visitor function------------------------------- */
				return ts.visitEachChild(node, visitor, context);
			}; // visitor;
			/* --------------------Returns for transformer function--------------------------------- */
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
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

export default duplicateUpdater;
