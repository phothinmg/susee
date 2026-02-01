import transformFunction from "@suseejs/transformer";
import ts from "typescript";

function replaceInJs(
	fileName: string,
	sourceCode: string,
	compilerOptions: ts.CompilerOptions,
): string {
	const sourceFile = ts.createSourceFile(
		fileName,
		sourceCode,
		ts.ScriptTarget.Latest,
		true,
	);
	const transformer: ts.TransformerFactory<ts.SourceFile> = (
		context: ts.TransformationContext,
	): ts.Transformer<ts.SourceFile> => {
		const { factory } = context;
		const visitor = (node: ts.Node): ts.Node => {
			if (ts.isExpressionStatement(node)) {
				const expr = node.expression;
				if (
					ts.isBinaryExpression(expr) &&
					ts.isPropertyAccessExpression(expr.left) &&
					ts.isIdentifier(expr.left.expression) &&
					expr.left.expression.escapedText === "exports" &&
					ts.isIdentifier(expr.left.name) &&
					expr.left.name.escapedText === "default" &&
					expr.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
					ts.isIdentifier(expr.right)
				) {
					const newLeftExpr = factory.createIdentifier("module");
					const newName = factory.createIdentifier("exports");
					const newLeft = factory.updatePropertyAccessExpression(
						expr.left,
						newLeftExpr,
						newName,
					);
					const newExpr = factory.updateBinaryExpression(
						expr,
						newLeft,
						expr.operatorToken,
						expr.right,
					);
					return factory.updateExpressionStatement(node, newExpr);
				}
			}
			return ts.visitEachChild(node, visitor, context);
		}; // visitor
		return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
	}; // transformer
	return transformFunction(transformer, sourceFile, compilerOptions);
}

function replaceInTs(
	fileName: string,
	sourceCode: string,
	compilerOptions: ts.CompilerOptions,
): string {
	const sourceFile = ts.createSourceFile(
		fileName,
		sourceCode,
		ts.ScriptTarget.Latest,
		true,
	);
	const transformer: ts.TransformerFactory<ts.SourceFile> = (
		context: ts.TransformationContext,
	): ts.Transformer<ts.SourceFile> => {
		const { factory } = context;
		const visitor = (node: ts.Node): ts.Node => {
			if (
				ts.isExportAssignment(node) &&
				node.modifiers === undefined &&
				!node.isExportEquals
			) {
				return factory.createExportAssignment(
					node.modifiers,
					true,
					node.expression,
				);
			}
			// ------------------------------------------------------------
			return ts.visitEachChild(node, visitor, context);
		}; // visitor
		return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
	}; // transformer
	return transformFunction(transformer, sourceFile, compilerOptions);
}

export { replaceInJs, replaceInTs };
