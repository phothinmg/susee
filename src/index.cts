import fs = require("node:fs");
import path = require("node:path");
import tcolor = require("@suseejs/tcolor");
import ts = require("typescript");
import SuseeTypes = require("@suseejs/types");

namespace utils {
	/**
	 * Creates a new Error object with the given message and options.
	 * @param {string} [message] - The error message.
	 * @param {ErrorOptions} [options] - The error options.
	 * @returns {Error} The created Error object.
	 */
	export function emitError(message?: string, options?: ErrorOptions): Error {
		return new Error(message, options);
	} // function utils.emitError
	/**
	 * Returns a promise that resolves after a specified amount of time.
	 * @param {number} time - The amount of time to wait in milliseconds.
	 * @returns {Promise<void>} A promise that resolves after the specified amount of time.
	 */
	export const wait = (time: number): Promise<void> =>
		new Promise((resolve) => setTimeout(resolve, time)); // function utils.wait
	/**
	 * Finds all properties in a given node.
	 * @param {ts.Node} node - The node to search.
	 * @returns {string[]} An array of property names.
	 */
	export function findProperty(node: ts.Node): string[] {
		const properties: string[] = [];
		if (
			ts.isPropertyAccessExpression(node) &&
			ts.isIdentifier(node.expression)
		) {
			properties.push(node.expression.text);
		}

		node.forEachChild((n) => findProperty(n));
		return properties;
	} // function utils.findProperty
	export namespace str {
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
		} // function utils.str.splitCamelCase
	} // namespace utils.str
	export namespace file {
		export const resolvePath = ts.sys.resolvePath;
		export const fileExists = ts.sys.fileExists;
		export const directoryExists = ts.sys.directoryExists;
		export const createDirectory = ts.sys.createDirectory;
		export const readDirectory = ts.sys.readDirectory;
		export function deleteFile(filePath: string) {
			filePath = resolvePath(filePath);
			if (fileExists(filePath) && typeof ts.sys.deleteFile === "function") {
				ts.sys.deleteFile(filePath);
			}
		} // function utils.file.deleteFile
		/**
		 * Clears a folder by deleting all its contents.
		 * @param {string} folderPath - The path to the folder to clear.
		 * @throws {Error} If the folder does not exist.
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
		} // function utils.file.clearFolder
		/**
		 * Writes a file to disk.
		 * @param {string} file - The file path to write to.
		 * @param {string} content - The content to write to the file.
		 * @returns {Promise<void>} A promise that resolves when the file has been written.
		 */
		export async function writeFile(
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
		} // function utils.file.writeFile
		/**
		 * Reads a file from disk.
		 * @param {string} filePath - The file path to read from.
		 * @returns {string} The content of the file.
		 * @throws {Error} If the file does not exist.
		 */
		export function readFile(filePath: string): string {
			const resolvedFilePath = resolvePath(filePath);
			if (!fileExists(resolvedFilePath))
				throw emitError(`${filePath} does not exist.`);
			const content = ts.sys.readFile(resolvedFilePath, "utf8");
			if (content) {
				return content;
			} else {
				console.warn(`When reading ${filePath} received content is blank.`);
				return "";
			}
		} // function utils.file.readFile
	} // namespace utils.file
	export namespace check {
		/**
		 * Checks the given source file for module type (CommonJS or ESM).
		 * @param sourceFile - The source file to check.
		 * @param file - The file path of the source file.
		 * @returns An object containing the results of the check.
		 * @returns {isCommonJs: boolean, isEsm: boolean}
		 */
		export const moduleType = (sourceFile: ts.SourceFile, file: string) => {
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
		}; // function utils.check.moduleType
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
		} //function utils.check.isJsxContent
		/**
		 * Checks if a given node is inside a namespace declaration.
		 * It does this by traversing up the parent nodes until it finds a module declaration with the namespace flag set.
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
		}; //function utils.check.isInsideNamespace
	} // namespace utils.check
	export namespace plugins {
		/**
		 * Applies plugins that modify dependencies files.
		 * @param plugins An array of plugins to apply. Each plugin can be a SuseeTypes.SuseePlugin or a SuseeTypes.SuseePluginFunction.
		 * @param depFiles The dependencies files object to modify.
		 * @param compilerOptions The TypeScript compiler options.
		 * @returns The modified dependencies files object.
		 */
		export async function depPluginParser(
			plugins: (SuseeTypes.SuseePlugin | SuseeTypes.SuseePluginFunction)[],
			depFiles: SuseeTypes.DependenciesFiles,
			compilerOptions: ts.CompilerOptions,
		) {
			if (plugins.length) {
				for (const plugin of plugins) {
					const _plugin = typeof plugin === "function" ? plugin() : plugin;
					if (_plugin.type === "dependency") {
						if (_plugin.async) {
							depFiles = await _plugin.func(depFiles, compilerOptions);
						} else {
							depFiles = _plugin.func(depFiles, compilerOptions);
						}
					}
				}
			}
			return depFiles;
		} //function utils.plugins.depPluginParser

		/**
		 * Applies pre-process or post-process  plugins that modify code.
		 * @param plugins An array of plugins to apply. Each plugin can be a SuseeTypes.SuseePlugin or a SuseeTypes.SuseePluginFunction.
		 * @param code The code string to modify.
		 * @param file The file name of the code string.
		 * @returns The modified code string.
		 */
		export async function processPluginParser(
			plugins: (SuseeTypes.SuseePlugin | SuseeTypes.SuseePluginFunction)[],
			code: string,
			file?: string | undefined,
		) {
			if (plugins.length) {
				for (const plugin of plugins) {
					const _plugin = typeof plugin === "function" ? plugin() : plugin;
					if (
						_plugin.type === "pre-process" ||
						_plugin.type === "post-process"
					) {
						if (_plugin.async) {
							code = await _plugin.func(code, file);
						} else {
							code = _plugin.func(code, file);
						}
					}
				}
			}
			return code;
		} //function utils.plugins.processPluginParser
	} // namespace utils.plugins
	export namespace hooks {
		/**
		 * Applies dependency internal hooks that modify dependencies files.
		 * @param depHooks An array of dependency plugins to apply. Each plugin can be a SuseeTypes.DependencyPlugin or a SuseeTypes.DependencyPluginFunction.
		 * @param depFiles The dependencies files object to modify.
		 * @param compilerOptions The TypeScript compiler options.
		 * @returns The modified dependencies files object.
		 */
		export async function depHookParser(
			depHooks: SuseeTypes.DependencyPlugin[],
			depFiles: SuseeTypes.DependenciesFiles,
			compilerOptions: ts.CompilerOptions,
		) {
			if (depHooks.length) {
				for (const hook of depHooks) {
					if (hook.async) {
						depFiles = await hook.func(depFiles, compilerOptions);
					} else {
						depFiles = hook.func(depFiles, compilerOptions);
					}
				}
			}
			return depFiles;
		} //function utils.hooks.depHookParser
		/**
		 * Applies pre-process or post-process internal hooks that modify code.
		 * @param processHooks An array of plugins to apply. Each plugin can be a SuseeTypes.PreProcessPlugin or a SuseeTypes.PostProcessPlugin.
		 * @param code The code string to modify.
		 * @param file The file name of the code string.
		 * @returns The modified code string.
		 */
		export async function processHooksParser(
			processHooks: (
				| SuseeTypes.PreProcessPlugin
				| SuseeTypes.PostProcessPlugin
			)[],
			code: string,
			file?: string | undefined,
		) {
			if (processHooks.length) {
				for (const hook of processHooks) {
					if (hook.async) {
						code = await hook.func(code, file);
					} else {
						code = hook.func(code, file);
					}
				}
			}
			return code;
		} //function utils.hooks.processHooksParser
	} // namespace utils.hooks
} // namespace utils

export = utils;
