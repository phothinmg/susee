// Stateless approach for detecting and renaming duplicate global declarations
import path from "node:path";
import resolves from "@phothinmaung/resolves";
import transformFunction from "@suseejs/transformer";
import type { DepsFile, DuplicatesNameMap } from "@suseejs/types";
import ts from "typescript";

/** Normalize file path into a lookup key (strip extension, index -> dir) */
const normalizePathKey = (filePath: string) => {
	const parsed = path.parse(filePath);
	let noExt = path.join(parsed.dir, parsed.name);
	if (parsed.name === "index") noExt = parsed.dir;
	return path.normalize(noExt);
};

/** Build a map of declaration name -> Set<{fileKey}> */
export function collectDuplicates(deps: DepsFile[]): DuplicatesNameMap {
	const map: DuplicatesNameMap = new Map();
	for (const { file, content } of deps) {
		const key = normalizePathKey(file);
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const visit = (node: ts.Node, isGlobal = true): ts.Node | undefined => {
			if (isGlobal) {
				if (ts.isVariableStatement(node)) {
					node.declarationList.declarations.forEach((decl) => {
						if (ts.isIdentifier(decl.name)) {
							const name = decl.name.text;
							if (!map.has(name)) map.set(name, new Set([{ file: key }]));
							else map.get(name)?.add({ file: key });
						}
					});
				} else if (
					ts.isFunctionDeclaration(node) ||
					ts.isClassDeclaration(node) ||
					ts.isEnumDeclaration(node) ||
					ts.isInterfaceDeclaration(node) ||
					ts.isTypeAliasDeclaration(node)
				) {
					const name = node.name?.text;
					if (name) {
						if (!map.has(name)) map.set(name, new Set([{ file: key }]));
						else map.get(name)?.add({ file: key });
					}
				}
			}

			// walk into local scopes but mark them as not global
			if (
				ts.isBlock(node) ||
				ts.isFunctionDeclaration(node) ||
				ts.isFunctionExpression(node) ||
				ts.isArrowFunction(node) ||
				ts.isMethodDeclaration(node) ||
				ts.isClassDeclaration(node)
			) {
				if (ts.isBlock(node))
					ts.visitNodes(node.statements, (n) => visit(n, false));
				else ts.forEachChild(node, (n) => visit(n, false));
			} else {
				return ts.forEachChild(node, (n) => visit(n, isGlobal));
			}
			return node;
		};
		visit(sourceFile, true);
	}
	return map;
}

/** Unique name generator with a stable prefix */
function makeUniqueNameGenerator(prefix = "__dup__") {
	const counters: Map<string, number> = new Map();
	return (base: string) => {
		const count = (counters.get(base) ?? 0) + 1;
		counters.set(base, count);
		return `${prefix}${base}_${count}`;
	};
}

/** Create a rename plan for names declared in more than one file.
 * Returns: Map<name, Map<fileKey, newName>>
 */
export function createRenamePlan(dupes: DuplicatesNameMap, prefix?: string) {
	const plan = new Map<string, Map<string, string>>();
	const uniq = makeUniqueNameGenerator(prefix ?? "__dup__");
	dupes.forEach((files, name) => {
		if (files.size > 1) {
			const inner = new Map<string, string>();
			for (const f of files) {
				// biome-ignore lint/suspicious/noExplicitAny : any
				const key = (f as any).file as string;
				inner.set(key, uniq(name));
			}
			plan.set(name, inner);
		}
	});
	return plan;
}

/** Apply rename plan across files and return new deps list.
 * This is a single pipeline that: (1) renames declarations in-place, (2) updates imports/exports, (3) updates call/new/property references.
 */
export async function applyRenamePlan(
	deps: DepsFile[],
	compilerOptions: ts.CompilerOptions,
	plan: Map<string, Map<string, string>>,
): Promise<DepsFile[]> {
	// Helper to get file key
	const getKey = (file: string) => normalizePathKey(file);

	// First pass: rename local declarations according to plan
	const renameDeclarations = (compilerOptions: ts.CompilerOptions) => {
		return ({ file, content, ...rest }: DepsFile): DepsFile => {
			const fileKey = getKey(file);
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
						const newDecls = node.declarationList.declarations.map((decl) => {
							if (ts.isIdentifier(decl.name)) {
								const base = decl.name.text;
								const fileMap = plan.get(base);
								if (fileMap?.has(fileKey)) {
									return factory.updateVariableDeclaration(
										decl,
										factory.createIdentifier(fileMap.get(fileKey) as string),
										decl.exclamationToken,
										decl.type,
										decl.initializer,
									);
								}
							}
							return decl;
						});
						const newList = factory.updateVariableDeclarationList(
							node.declarationList,
							newDecls,
						);
						return factory.updateVariableStatement(
							node,
							node.modifiers,
							newList,
						);
					} else if (
						ts.isFunctionDeclaration(node) &&
						node.name &&
						ts.isIdentifier(node.name)
					) {
						const base = node.name.text;
						const fileMap = plan.get(base);
						if (fileMap?.has(fileKey)) {
							return factory.updateFunctionDeclaration(
								node,
								node.modifiers,
								node.asteriskToken,
								factory.createIdentifier(fileMap.get(fileKey) as string),
								node.typeParameters,
								node.parameters,
								node.type,
								node.body,
							);
						}
					} else if (
						ts.isClassDeclaration(node) &&
						node.name &&
						ts.isIdentifier(node.name)
					) {
						const base = node.name.text;
						const fileMap = plan.get(base);
						if (fileMap?.has(fileKey)) {
							return factory.updateClassDeclaration(
								node,
								node.modifiers,
								factory.createIdentifier(fileMap.get(fileKey) as string),
								node.typeParameters,
								node.heritageClauses,
								node.members,
							);
						}
					}
					return ts.visitEachChild(node, visitor, context);
				};
				return (root) => ts.visitNode(root, visitor) as ts.SourceFile;
			};
			const _content = transformFunction(
				transformer,
				sourceFile,
				compilerOptions,
			);
			return { file, content: _content, ...rest };
		};
	};

	// Second pass: update imports/exports and references using the newly produced names
	const updateReferences = (compilerOptions: ts.CompilerOptions) => {
		return ({ file, content, ...rest }: DepsFile): DepsFile => {
			const sourceFile = ts.createSourceFile(
				file,
				content,
				ts.ScriptTarget.Latest,
				true,
			);
			const fileKey = getKey(file);
			// local mapping for this file: base -> newName if this file contains renamed declaration
			const localMap = new Map<string, string>();
			plan.forEach((m, base) => {
				if (m.has(fileKey)) localMap.set(base, m.get(fileKey) as string);
			});

			// We'll build import mapping on the fly when processing import declarations
			const importMap: Map<string, string> = new Map(); // local imported base -> newName

			const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
				const { factory } = context;
				const visitor = (node: ts.Node): ts.Node => {
					if (ts.isImportDeclaration(node)) {
						const moduleSpec = node.moduleSpecifier;
						let spec = "";
						if (ts.isStringLiteral(moduleSpec)) spec = moduleSpec.text;
						if (spec.startsWith(".") || spec.startsWith("/")) {
							const baseDir = path.dirname(file);
							spec = normalizePathKey(path.resolve(baseDir, spec));
						}
						// named imports
						if (
							node.importClause?.namedBindings &&
							ts.isNamedImports(node.importClause.namedBindings)
						) {
							const updated = node.importClause.namedBindings.elements.map(
								(el) => {
									const importedName = el.name.text.trim();
									const planMap = plan.get(importedName);
									if (planMap?.has(spec)) {
										const newName = planMap.get(spec) as string;
										importMap.set(importedName, newName);
										return factory.updateImportSpecifier(
											el,
											el.isTypeOnly,
											el.propertyName,
											factory.createIdentifier(newName),
										);
									}
									return el;
								},
							);
							const newNamed = factory.updateNamedImports(
								node.importClause.namedBindings,
								updated,
							);
							const newClause = factory.updateImportClause(
								node.importClause,
								node.importClause.phaseModifier,
								node.importClause.name,
								newNamed,
							);
							return factory.updateImportDeclaration(
								node,
								node.modifiers,
								newClause,
								node.moduleSpecifier,
								node.attributes,
							);
						}
						// default import
						if (
							node.importClause?.name &&
							ts.isIdentifier(node.importClause.name)
						) {
							const importedName = node.importClause.name.text.trim();
							const planMap = plan.get(importedName);
							if (planMap?.has(spec)) {
								const newName = planMap.get(spec) as string;
								importMap.set(importedName, newName);
								const newClause = factory.updateImportClause(
									node.importClause,
									node.importClause.phaseModifier,
									factory.createIdentifier(newName),
									node.importClause.namedBindings,
								);
								return factory.updateImportDeclaration(
									node,
									node.modifiers,
									newClause,
									node.moduleSpecifier,
									node.attributes,
								);
							}
						}
					} else if (ts.isExportSpecifier(node)) {
						if (ts.isIdentifier(node.name)) {
							const base = node.name.text;
							// if this file exports a renamed local identifier, update exported name
							if (localMap.has(base)) {
								return factory.updateExportSpecifier(
									node,
									node.isTypeOnly,
									node.propertyName,
									factory.createIdentifier(localMap.get(base) as string),
								);
							}
						}
					} else if (ts.isExportAssignment(node)) {
						const expr = node.expression;
						if (ts.isIdentifier(expr)) {
							const base = expr.text;
							if (localMap.has(base)) {
								return factory.updateExportAssignment(
									node,
									node.modifiers,
									factory.createIdentifier(localMap.get(base) as string),
								);
							}
						}
					} else if (ts.isCallExpression(node)) {
						if (ts.isIdentifier(node.expression)) {
							const base = node.expression.text;
							const replacement = localMap.get(base) ?? importMap.get(base);
							if (replacement) {
								return factory.updateCallExpression(
									node,
									factory.createIdentifier(replacement),
									node.typeArguments,
									node.arguments,
								);
							}
						}
					} else if (ts.isPropertyAccessExpression(node)) {
						if (ts.isIdentifier(node.expression)) {
							const base = node.expression.text;
							const replacement = localMap.get(base) ?? importMap.get(base);
							if (replacement) {
								return factory.updatePropertyAccessExpression(
									node,
									factory.createIdentifier(replacement),
									node.name,
								);
							}
						}
					} else if (ts.isNewExpression(node)) {
						if (ts.isIdentifier(node.expression)) {
							const base = node.expression.text;
							const replacement = localMap.get(base) ?? importMap.get(base);
							if (replacement) {
								return factory.updateNewExpression(
									node,
									factory.createIdentifier(replacement),
									node.typeArguments,
									node.arguments,
								);
							}
						}
					} else if (ts.isIdentifier(node)) {
						// general identifier use - avoid renaming declarations here; only rename plain identifier occurrences that match imported names
						const name = node.text;
						if (importMap.has(name))
							return factory.createIdentifier(importMap.get(name) as string);
					}
					return ts.visitEachChild(node, visitor, context);
				};
				return (root) => ts.visitNode(root, visitor) as ts.SourceFile;
			};
			const _content = transformFunction(
				transformer,
				sourceFile,
				compilerOptions,
			);
			return { file, content: _content, ...rest };
		};
	};

	// Run pipeline: rename declarations first, then references
	const pipeline = resolves([
		[renameDeclarations, compilerOptions],
		[updateReferences, compilerOptions],
		[updateReferences, compilerOptions], // run twice to catch chained changes (imports -> calls)
	]);
	const fns = await pipeline.concurrent();
	for (const fn of fns) deps = deps.map(fn);
	return deps;
}

export default {
	collectDuplicates,
	createRenamePlan,
	applyRenamePlan,
};
