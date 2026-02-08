import resolves from "@phothinmaung/resolves";
import tcolor from "@suseejs/tcolor";
import utils from "@suseejs/utils";
import ts from "typescript";
import type { DepsFile } from "../types_def.js";

const depsCheck = {
	/** @private */
	types(deps: DepsFile[], compilerOptions: ts.CompilerOptions) {
		if (!compilerOptions.noCheck) {
			const filePaths = deps.map((i) => i.file);
			let _err = false;
			// Create program
			const program = ts.createProgram(filePaths, compilerOptions);
			// Check each file individually for immediate feedback
			for (const filePath of filePaths) {
				const sourceFile = program.getSourceFile(filePath);
				if (!sourceFile) {
					console.error(tcolor.magenta(`File not found: ${filePath}`));
					ts.sys.exit(1);
				}

				const diagnostics = [
					...program.getSyntacticDiagnostics(sourceFile),
					...program.getSemanticDiagnostics(sourceFile),
					...program.getDeclarationDiagnostics(sourceFile),
				];

				if (diagnostics.length > 0) {
					const formatHost: ts.FormatDiagnosticsHost = {
						getCurrentDirectory: () => process.cwd(),
						getCanonicalFileName: (fileName) => fileName,
						getNewLine: () => ts.sys.newLine,
					};
					console.error(
						ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost),
					);
					_err = true;
				}
			}
			if (_err) {
				ts.sys.exit(1);
			} else {
				return true;
			}
		}
	},
	/** @private */
	ext(deps: DepsFile[]) {
		const tsExt = new Set([".ts", ".mts", ".cts", ".tsx"]);
		for (const dep of deps) {
			const ext = utils.extname(dep.file);
			if (!tsExt.has(ext)) {
				console.error(
					tcolor.magenta(`${dep.file} has no valid TypeScript extension`),
				);
				ts.sys.exit(1);
			}
		}
		return true;
	},
	/** @private */
	moduleType(deps: DepsFile[]) {
		let _esmCount = 0;
		let cjsCount = 0;
		let unknownCount = 0;
		for (const dep of deps) {
			try {
				// Create a TypeScript source file
				const sourceFile = ts.createSourceFile(
					dep.file,
					dep.content,
					ts.ScriptTarget.Latest,
					true,
				);

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
				}
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
						`Error checking module format for ${dep.file} : \n ${error}`,
					),
				);
				unknownCount++;
			}
		}
		if (unknownCount) {
			console.error(
				tcolor.magenta(
					"Unknown error when checking module types in the dependencies tree.",
				),
			);
			ts.sys.exit(1);
		}
		if (cjsCount) {
			console.error(
				tcolor.magenta(
					"The package detects CommonJs format  in the dependencies tree, that unsupported.",
				),
			);
			ts.sys.exit(1);
		}
		return true;
	},
	nodeCheck(nodeEnvOption: boolean, nodeModules: boolean) {
		if (!nodeEnvOption && nodeModules) {
			console.error();
			ts.sys.exit(1);
		}
		return true;
	},
	async make(
		deps: DepsFile[],
		compilerOptions: ts.CompilerOptions,
		nodeModules: boolean,
		nodeEnv = true,
	) {
		const res = resolves([
			[depsCheck.ext, deps],
			[depsCheck.moduleType, deps],
			[depsCheck.nodeCheck, nodeEnv, nodeModules],
			[depsCheck.types, deps, compilerOptions],
		]);
		const results = await res.concurrent();
		return results.every((r) => r === true);
	},
};

export default depsCheck;
