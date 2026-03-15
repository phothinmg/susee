import assert from "node:assert";
import { describe, it } from "node:test";
import ts from "typescript";
import utils from "../../src/lib/utils.js";

describe("utils.sourceFileToString", () => {
	it("prints updated source file after AST transform", () => {
		const sourceFile = ts.createSourceFile(
			"index.ts",
			"export const value = 1;",
			ts.ScriptTarget.Latest,
			true,
		);

		const transformed = ts.transform(sourceFile, [
			(context) => {
				const { factory } = context;
				const visitor = (node: ts.Node): ts.Node => {
					if (
						ts.isVariableDeclaration(node) &&
						ts.isIdentifier(node.name) &&
						node.name.text === "value"
					) {
						return factory.updateVariableDeclaration(
							node,
							factory.createIdentifier("nextValue"),
							node.exclamationToken,
							node.type,
							node.initializer,
						);
					}
					return ts.visitEachChild(node, visitor, context);
				};
				return (node) => ts.visitNode(node, visitor) as ts.SourceFile;
			},
		]);

		const output = utils.sourceFileToString(
			transformed.transformed[0] as ts.SourceFile,
		);

		transformed.dispose();

		assert.match(output, /export const nextValue = 1;/);
		assert.doesNotMatch(output, /export const value = 1;/);
	});
});
