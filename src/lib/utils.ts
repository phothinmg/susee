import fs from "node:fs";
import path from "node:path";
import tcolor from "@suseejs/tcolor";
import ts from "typescript";

namespace utilities {
	/**
	 * Splits a camelCase string into a space-separated string.
	 * @param {string} str - The string to split.
	 * @returns {string} The split string.
	 */
	export function splitCamelCase(str: string): string {
		const splitString = str
			.replace(/([a-z])([A-Z])/g, "$1 $2")
			.replace(/(_|-|\/)([a-z] || [A-Z])/g, " ")
			.replace(/([A-Z])/g, (match) => match.toLowerCase())
			.replace(/^([a-z])/, (match) => match.toUpperCase());
		return splitString;
	}
	/**
	 * Returns a promise that resolves after a specified amount of time.
	 * @param {number} time - The amount of time to wait in milliseconds.
	 * @returns {Promise<void>} A promise that resolves after the specified amount of time.
	 */
	export const wait = (time: number) =>
		new Promise((resolve) => setTimeout(resolve, time));

	/**
	 * Checks the given source file for module type (CommonJS or ESM).
	 * @param sourceFile - The source file to check.
	 * @param file - The file path of the source file.
	 * @returns An object containing the results of the check.
	 * @returns {isCommonJs: boolean, isEsm: boolean}
	 */
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
	/**
	 * Checks if the given code string contains JSX syntax.
	 * @param code The content of the file as a string.
	 * @returns true if the file contains JSX, false otherwise.
	 */
	export function isJsxContent(code: string): boolean {
		const sourceFile = ts.createSourceFile(
			"file.tsx",
			code,
			ts.ScriptTarget.Latest,
			/*setParentNodes*/ true,
			ts.ScriptKind.TSX,
		);

		let containsJsx = false;

		function visitor(node: ts.Node) {
			// Check for JSX Elements, Self Closing Elements, or JSX Fragments
			if (
				ts.isJsxElement(node) ||
				ts.isJsxSelfClosingElement(node) ||
				ts.isJsxFragment(node)
			) {
				containsJsx = true;
				return;
			}
			ts.forEachChild(node, visitor);
		}

		visitor(sourceFile);

		return containsJsx;
	}

	/**
	 * Writes a compiled file to disk. This function will ensure that the directory
	 * structure exists before writing the file.
	 * @param file The path to the file to write.
	 * @param content The content to write to the file.
	 * @returns A promise that resolves when the file has been written.
	 */
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

	/**
	 * Checks if the given node is inside a namespace declaration.
	 * @param n The node to check.
	 * @returns true if the node is inside a namespace declaration, false otherwise.
	 */
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
	/**
	 * Clears the contents of a folder by removing all files and subfolders.
	 * If the folder does not exist, the function does not throw an error.
	 * @param folderPath The path to the folder to clear.
	 * @returns A promise that resolves when the folder has been cleared.
	 */
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
}

export { utilities };
