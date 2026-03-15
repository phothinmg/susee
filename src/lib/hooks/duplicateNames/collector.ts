// cSpell:disable
import transformFunction from "@suseejs/transformer";
import type {
	BundleHandler,
	DependenciesFile,
	DuplicatesNameMap,
} from "@suseejs/types";
import ts from "typescript";

const collector = (
	compilerOptions: ts.CompilerOptions,
	namesMap: DuplicatesNameMap,
): BundleHandler => {
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

export default collector;
