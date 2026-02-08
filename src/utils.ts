import fs from "node:fs";
import path from "node:path";
import tcolor from "@suseejs/tcolor";
import ts from "typescript";

namespace utilities {
	export const wait = (time: number): Promise<void> =>
		new Promise((resolve) => setTimeout(resolve, time));

	export async function clearFolder(folderPath: string) {
		folderPath = path.resolve(process.cwd(), folderPath);
		try {
			const entries = await fs.promises.readdir(folderPath, {
				withFileTypes: true,
			});
			await Promise.all(
				entries.map((entry) =>
					fs.promises.rm(path.join(folderPath, entry.name), {
						recursive: true,
					}),
				),
			);
		} catch (error) {
			// biome-ignore lint/suspicious/noExplicitAny: error code
			if ((error as any).code !== "ENOENT") {
				throw error;
			}
		}
	}

	export async function writeCompileFile(
		file: string,
		content: string,
	): Promise<void> {
		const filePath = ts.sys.resolvePath(file);
		const dir = path.dirname(filePath);
		if (!ts.sys.directoryExists(dir)) {
			await fs.promises.mkdir(dir, { recursive: true });
		}
		await wait(500);
		await fs.promises.writeFile(filePath, content);
	}

	export const isInsideNamespace = (n: ts.Node): boolean => {
		let current: ts.Node | undefined = n.parent;
		while (current) {
			if (
				ts.isModuleDeclaration(current) &&
				current.flags === ts.NodeFlags.Namespace
			) {
				return true;
			}
			current = current.parent;
		}
		return false;
	};

	export const checkModuleType = (sourceFile: ts.SourceFile, file: string) => {
		let _esmCount = 0;
		let cjsCount = 0;
		let unknownCount = 0;

		try {
			let hasESMImports = false;
			let hasCommonJS = false;

			// Walk through the AST to detect module syntax
			function walk(node: ts.Node) {
				// Check for ESM import/export syntax
				if (
					ts.isImportDeclaration(node) ||
					ts.isImportEqualsDeclaration(node) ||
					ts.isExportDeclaration(node) ||
					ts.isExportSpecifier(node) ||
					ts.isExportAssignment(node)
				) {
					hasESMImports = true;
				}

				// Check for export modifier on declarations
				if (
					(ts.isVariableStatement(node) ||
						ts.isFunctionDeclaration(node) ||
						ts.isInterfaceDeclaration(node) ||
						ts.isTypeAliasDeclaration(node) ||
						ts.isEnumDeclaration(node) ||
						ts.isClassDeclaration(node)) &&
					node.modifiers?.some(
						(mod) => mod.kind === ts.SyntaxKind.ExportKeyword,
					)
				) {
					hasESMImports = true;
				}

				// Check for CommonJS require/exports
				if (ts.isCallExpression(node)) {
					if (
						ts.isIdentifier(node.expression) &&
						node.expression.text === "require" &&
						node.arguments.length > 0
					) {
						hasCommonJS = true;
					}
				}

				// Check for module.exports or exports.xxx
				if (ts.isPropertyAccessExpression(node)) {
					const text = node.getText(sourceFile);
					if (
						text.startsWith("module.exports") ||
						text.startsWith("exports.")
					) {
						hasCommonJS = true;
					}
				}

				// Continue walking the AST
				ts.forEachChild(node, walk);
			} //---
			walk(sourceFile);

			// Determine the module format based on what we found
			if (hasESMImports && !hasCommonJS) {
				_esmCount++;
			} else if (hasCommonJS && !hasESMImports) {
				cjsCount++;
			} else if (hasESMImports && hasCommonJS) {
				// Mixed - probably ESM with dynamic imports or similar
				_esmCount++;
			}
		} catch (error) {
			console.error(
				tcolor.magenta(
					`Error checking module format for ${file} : \n ${error}`,
				),
			);
			unknownCount++;
		}
		if (unknownCount > 0) {
			console.error(tcolor.magenta(`Error checking module format.`));
			ts.sys.exit(1);
		}

		return {
			isCommonJs: cjsCount > 0,
			isEsm: _esmCount > 0,
		};
	};

	export function findProperty(node: ts.Node) {
		const properties: string[] = [];
		if (
			ts.isPropertyAccessExpression(node) &&
			ts.isIdentifier(node.expression)
		) {
			properties.push(node.expression.text);
		}

		node.forEachChild((n) => findProperty(n));
		return properties;
	}
}

export default utilities;
