/*! *****************************************************************************
Copyright (c) Pho Thin Mg <phothinmg@disroot.org>

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0
***************************************************************************** */
import TsConfig from "@suseejs/tsconfig";
import anonymous from "@suseejs/anonymous";
import dependencies from "@suseejs/dependencies";
import duplicateHandlers from "@suseejs/duplicates";
import fs from "node:fs";
import path from "node:path";
import resolves from "@phothinmaung/resolves";
import tcolor from "@suseejs/tcolor";
import transformFunction from "@suseejs/transformer";
import ts from "typescript";
import utils from "@suseejs/utils";
function removeExportExpressionHandler(compilerOptions) {
    return ({ file, content }) => {
        const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
        const transformer = (context) => {
            const { factory } = context;
            const visitor = (node) => {
                if (ts.isFunctionDeclaration(node) ||
                    ts.isClassDeclaration(node) ||
                    ts.isInterfaceDeclaration(node) ||
                    ts.isTypeAliasDeclaration(node) ||
                    ts.isEnumDeclaration(node) ||
                    ts.isVariableStatement(node)) {
                    const modifiers = node.modifiers?.filter((m) => m.kind !== ts.SyntaxKind.ExportKeyword &&
                        m.kind !== ts.SyntaxKind.DefaultKeyword);
                    if (modifiers?.length !== node.modifiers?.length) {
                        if (ts.isFunctionDeclaration(node)) {
                            return factory.updateFunctionDeclaration(node, modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body);
                        }
                        if (ts.isClassDeclaration(node)) {
                            return factory.updateClassDeclaration(node, modifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
                        }
                        if (ts.isInterfaceDeclaration(node)) {
                            return factory.updateInterfaceDeclaration(node, modifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
                        }
                        if (ts.isTypeAliasDeclaration(node)) {
                            return factory.updateTypeAliasDeclaration(node, modifiers, node.name, node.typeParameters, node.type);
                        }
                        if (ts.isEnumDeclaration(node)) {
                            return factory.updateEnumDeclaration(node, modifiers, node.name, node.members);
                        }
                        if (ts.isVariableStatement(node)) {
                            return factory.updateVariableStatement(node, modifiers, node.declarationList);
                        }
                    }
                }
                if (ts.isExportDeclaration(node)) {
                    return factory.createEmptyStatement();
                }
                if (ts.isExportAssignment(node)) {
                    const expr = node.expression;
                    if (ts.isIdentifier(expr)) {
                        return factory.createEmptyStatement();
                    }
                }
                return ts.visitEachChild(node, visitor, context);
            };
            return (rootNode) => ts.visitNode(rootNode, visitor);
        };
        let _content = transformFunction(transformer, sourceFile, compilerOptions);
        _content = _content.replace(/^s*;\s*$/gm, "").trim();
        return { file, content: _content };
    };
}
function removeImportExpressionHandler(removedStatements, compilerOptions) {
    return ({ file, content }) => {
        const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
        const transformer = (context) => {
            const { factory } = context;
            const visitor = (node) => {
                if (ts.isImportDeclaration(node)) {
                    const text = node.getText(sourceFile);
                    removedStatements.push(text);
                    return factory.createEmptyStatement();
                }
                if (ts.isImportEqualsDeclaration(node)) {
                    const text = node.getText(sourceFile);
                    removedStatements.push(text);
                    return factory.createEmptyStatement();
                }
                return ts.visitEachChild(node, visitor, context);
            };
            return (rootNode) => ts.visitNode(rootNode, visitor);
        };
        let _content = transformFunction(transformer, sourceFile, compilerOptions);
        _content = _content.replace(/^s*;\s*$/gm, "").trim();
        return { file, content: _content };
    };
}
function mergeImports(imports) {
    const importMap = new Map();
    const typeImportMap = new Map();
    const defaultImports = new Map();
    const typeDefaultImports = new Map();
    const namespaceImports = new Map();
    for (const importStr of imports) {
        const importMatch = importStr.match(/import\s+(?:type\s+)?(?:(.*?)\s+from\s+)?["']([^"']+)["'];?/);
        if (!importMatch)
            continue;
        const [, importClause, _modulePath] = importMatch;
        const isTypeImport = importStr.includes("import type");
        const modulePath = _modulePath;
        if (!importClause) {
            const defaultMatch = importStr.match(/import\s+(?:type\s+)?(\w+)/);
            if (defaultMatch) {
                const importName = defaultMatch[1];
                const targetMap = isTypeImport ? typeDefaultImports : defaultImports;
                if (!targetMap.has(modulePath))
                    targetMap.set(modulePath, new Set());
                targetMap.get(modulePath)?.add(importName);
            }
            continue;
        }
        if (importClause.startsWith("{")) {
            const targetMap = isTypeImport ? typeImportMap : importMap;
            if (!targetMap.has(modulePath))
                targetMap.set(modulePath, new Set());
            const names = importClause
                .replace(/[{}]/g, "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            names.forEach((name) => targetMap.get(modulePath)?.add(name));
        }
        else if (importClause.startsWith("* as")) {
            const namespaceMatch = importClause.match(/\*\s+as\s+(\w+)/);
            if (namespaceMatch) {
                const namespaceName = namespaceMatch[1];
                if (!namespaceImports.has(modulePath))
                    namespaceImports.set(modulePath, new Set());
                namespaceImports.get(modulePath)?.add(namespaceName);
            }
        }
        else {
            const targetMap = isTypeImport ? typeDefaultImports : defaultImports;
            if (!targetMap.has(modulePath))
                targetMap.set(modulePath, new Set());
            targetMap.get(modulePath)?.add(importClause.trim());
        }
    }
    const mergedImports = [];
    for (const [modulePath, regularNames] of importMap) {
        const typeNames = typeImportMap.get(modulePath) || new Set();
        const finalNames = new Set([...regularNames]);
        for (const typeName of typeNames) {
            if (!regularNames.has(typeName)) {
                finalNames.add(typeName);
            }
        }
        if (finalNames.size > 0) {
            const importNames = Array.from(finalNames).sort().join(", ");
            mergedImports.push(`import { ${importNames} } from "${modulePath}";`);
        }
    }
    for (const [modulePath, typeNames] of typeImportMap) {
        if (!importMap.has(modulePath) && typeNames.size > 0) {
            const importNames = Array.from(typeNames).sort().join(", ");
            mergedImports.push(`import type { ${importNames} } from "${modulePath}";`);
        }
    }
    for (const [modulePath, regularDefaultNames] of defaultImports) {
        const typeDefaultNames = typeDefaultImports.get(modulePath) || new Set();
        const finalNames = new Set([...regularDefaultNames]);
        for (const typeName of typeDefaultNames) {
            if (!regularDefaultNames.has(typeName)) {
                finalNames.add(typeName);
            }
        }
        if (finalNames.size > 0) {
            const importNames = Array.from(finalNames).join(", ");
            mergedImports.push(`import ${importNames} from "${modulePath}";`);
        }
    }
    for (const [modulePath, typeDefaultNames] of typeDefaultImports) {
        if (!defaultImports.has(modulePath) && typeDefaultNames.size > 0) {
            const importNames = Array.from(typeDefaultNames).join(", ");
            mergedImports.push(`import type ${importNames} from "${modulePath}";`);
        }
    }
    for (const [modulePath, names] of namespaceImports) {
        if (names.size > 0) {
            const importNames = Array.from(names).join(", ");
            mergedImports.push(`import * as ${importNames} from "${modulePath}";`);
        }
    }
    return mergedImports.sort();
}
async function bundler({ depsFiles, compilerOptions, renameDuplicates, }) {
    const reName = renameDuplicates ?? true;
    const namesMap = new Map();
    const callNameMap = [];
    const importNameMap = [];
    const exportNameMap = [];
    const exportDefaultExportNameMap = [];
    const exportDefaultImportNameMap = [];
    let removedStatements = [];
    if (reName) {
        depsFiles = await duplicateHandlers.renamed(depsFiles, namesMap, callNameMap, importNameMap, exportNameMap, compilerOptions);
    }
    else {
        depsFiles = await duplicateHandlers.notRenamed(depsFiles, namesMap, compilerOptions);
    }
    await utils.wait(1000);
    depsFiles = await anonymous(depsFiles, exportDefaultExportNameMap, exportDefaultImportNameMap, compilerOptions);
    await utils.wait(1000);
    const removeImports = resolves([
        [removeImportExpressionHandler, removedStatements, compilerOptions],
    ]);
    const removeImport = await removeImports.concurrent();
    depsFiles = depsFiles.map(removeImport[0]);
    await utils.wait(1000);
    const removeExports = resolves([
        [removeExportExpressionHandler, compilerOptions],
    ]);
    const removeExport = await removeExports.concurrent();
    const deps_files = depsFiles.slice(0, -1).map(removeExport[0]);
    const mainFile = depsFiles.slice(-1);
    const regexp = /["']((?!\.\/|\.\.\/)[^"']+)["']/;
    removedStatements = removedStatements.filter((i) => regexp.test(i));
    removedStatements = mergeImports(removedStatements);
    const importStatements = removedStatements.join("\n").trim();
    const depFilesContent = deps_files
        .map((i) => {
        const file = `//${path.relative(process.cwd(), i.file)}`;
        return `${file}\n${i.content}`;
    })
        .join("\n")
        .trim();
    const mainFileContent = mainFile
        .map((i) => {
        const file = `//${path.relative(process.cwd(), i.file)}`;
        return `${file}\n${i.content}`;
    })
        .join("\n")
        .trim();
    await utils.wait(1000);
    const content = `${importStatements}\n${depFilesContent}\n${mainFileContent}`;
    return content;
}
function checkExports(file, str) {
    const sourceFile = ts.createSourceFile(file, str, ts.ScriptTarget.Latest, true);
    let nameExport = false;
    let defExport = false;
    const transformer = (context) => {
        const visitor = (node) => {
            if (ts.isExportAssignment(node) &&
                !node.isExportEquals &&
                node.modifiers === undefined &&
                ts.isIdentifier(node.expression)) {
                defExport = true;
            }
            else if (ts.isFunctionDeclaration(node) ||
                ts.isClassDeclaration(node)) {
                let exp = false;
                let def = false;
                node.modifiers?.forEach((mod) => {
                    if (mod.kind === ts.SyntaxKind.ExportKeyword) {
                        exp = true;
                    }
                    if (mod.kind === ts.SyntaxKind.DefaultKeyword) {
                        def = true;
                    }
                });
                if (exp && def)
                    defExport = true;
            }
            else if (ts.isExportAssignment(node) &&
                ts.isObjectLiteralExpression(node.expression)) {
                const pros = node.expression.properties;
                for (const pro of pros) {
                    if (pro.name && ts.isIdentifier(pro.name)) {
                        defExport = true;
                    }
                }
            }
            else if (ts.isNamedExports(node)) {
                nameExport = true;
            }
            else if (ts.isVariableStatement(node) ||
                ts.isFunctionDeclaration(node) ||
                ts.isInterfaceDeclaration(node) ||
                ts.isTypeAliasDeclaration(node)) {
                const isInsideNamespace = (n) => {
                    let current = n.parent;
                    while (current) {
                        if (ts.isModuleDeclaration(current) &&
                            current.flags === ts.NodeFlags.Namespace) {
                            return true;
                        }
                        current = current.parent;
                    }
                    return false;
                };
                node?.modifiers?.forEach((mod) => {
                    if (mod.kind === ts.SyntaxKind.ExportKeyword) {
                        if (!isInsideNamespace(node)) {
                            nameExport = true;
                        }
                    }
                });
            }
            return ts.visitEachChild(node, visitor, context);
        };
        return (rootNode) => ts.visitNode(rootNode, visitor);
    };
    ts.transform(sourceFile, [transformer]);
    return { nameExport, defExport };
}
const createHost = (sourceCode, fileName) => {
    const createdFiles = {};
    const host = {
        getSourceFile: (file, languageVersion) => {
            if (file === fileName) {
                return ts.createSourceFile(file, sourceCode, languageVersion);
            }
            return undefined;
        },
        writeFile: (fileName, contents) => {
            createdFiles[fileName] = contents;
        },
        getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
        getCurrentDirectory: () => "",
        getDirectories: () => [],
        fileExists: (file) => file === fileName,
        readFile: (file) => (file === fileName ? sourceCode : undefined),
        getCanonicalFileName: (file) => file,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => "\n",
    };
    return { createdFiles, host };
};
function replaceInJs(fileName, sourceCode, compilerOptions) {
    const sourceFile = ts.createSourceFile(fileName, sourceCode, ts.ScriptTarget.Latest, true);
    const transformer = (context) => {
        const { factory } = context;
        const visitor = (node) => {
            if (ts.isExpressionStatement(node)) {
                const expr = node.expression;
                if (ts.isBinaryExpression(expr) &&
                    ts.isPropertyAccessExpression(expr.left) &&
                    ts.isIdentifier(expr.left.expression) &&
                    expr.left.expression.escapedText === "exports" &&
                    ts.isIdentifier(expr.left.name) &&
                    expr.left.name.escapedText === "default" &&
                    expr.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                    ts.isIdentifier(expr.right)) {
                    const newLeftExpr = factory.createIdentifier("module");
                    const newName = factory.createIdentifier("exports");
                    const newLeft = factory.updatePropertyAccessExpression(expr.left, newLeftExpr, newName);
                    const newExpr = factory.updateBinaryExpression(expr, newLeft, expr.operatorToken, expr.right);
                    return factory.updateExpressionStatement(node, newExpr);
                }
            }
            return ts.visitEachChild(node, visitor, context);
        };
        return (rootNode) => ts.visitNode(rootNode, visitor);
    };
    return transformFunction(transformer, sourceFile, compilerOptions);
}
function replaceInTs(fileName, sourceCode, compilerOptions) {
    const sourceFile = ts.createSourceFile(fileName, sourceCode, ts.ScriptTarget.Latest, true);
    const transformer = (context) => {
        const { factory } = context;
        const visitor = (node) => {
            if (ts.isExportAssignment(node) &&
                node.modifiers === undefined &&
                !node.isExportEquals) {
                return factory.createExportAssignment(node.modifiers, true, node.expression);
            }
            return ts.visitEachChild(node, visitor, context);
        };
        return (rootNode) => ts.visitNode(rootNode, visitor);
    };
    return transformFunction(transformer, sourceFile, compilerOptions);
}
async function clearFolder(folderPath) {
    folderPath = path.resolve(process.cwd(), folderPath);
    try {
        const entries = await fs.promises.readdir(folderPath, {
            withFileTypes: true,
        });
        await Promise.all(entries.map((entry) => fs.promises.rm(path.join(folderPath, entry.name), {
            recursive: true,
        })));
    }
    catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
}
async function writeCompileFile(file, content) {
    const filePath = ts.sys.resolvePath(file);
    const dir = path.dirname(filePath);
    if (!ts.sys.directoryExists(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
    }
    await utils.wait(500);
    await fs.promises.writeFile(filePath, content);
}
class Compilers {
    constructor(options) {
        this._target = options?.target ?? "both";
        this._configPath = options?.configPath;
        this.files = {
            commonjs: undefined,
            commonjsTypes: undefined,
            esm: undefined,
            esmTypes: undefined,
            main: undefined,
            module: undefined,
            types: undefined,
        };
        this.outDir = "";
    }
    async commonjs(sourceCode, fileName, compilerOptions, isMain, hooks, isUpdate = true) {
        console.time(tcolor.green("Compiled Commonjs"));
        const ck = checkExports(fileName, sourceCode);
        if (ck.defExport && ck.nameExport) {
            console.warn(tcolor.yellow("Both name export and default export are exported from your project,that will effect on default export for commonjs output"));
        }
        const _host = createHost(sourceCode, fileName);
        const createdFiles = _host.createdFiles;
        const host = _host.host;
        const program = ts.createProgram([fileName], compilerOptions, host);
        program.emit();
        Object.entries(createdFiles).map(async ([outName, content]) => {
            if (ck.defExport && !ck.nameExport) {
                const ext = utils.extname(outName);
                if (ext === ".js") {
                    content = replaceInJs(fileName, content, compilerOptions);
                }
                if (ext === ".ts") {
                    content = replaceInTs(fileName, content, compilerOptions);
                }
            }
            if (hooks?.length) {
                for (const hook of hooks) {
                    if (hook.async) {
                        content = await hook.func(content, outName);
                    }
                    else {
                        content = hook.func(content, outName);
                    }
                }
            }
            if (isUpdate) {
                if (outName.match(/.js/g)) {
                    this.files.commonjs = outName.replace(/.js/g, ".cjs");
                }
                if (outName.match(/.d.ts/g)) {
                    this.files.commonjsTypes = outName.replace(/.d.ts/g, ".d.cts");
                }
                if (isMain &&
                    (this._target === "both" || this._target === "commonjs")) {
                    if (this.files.commonjs)
                        this.files.main = this.files.commonjs;
                    if (this.files.commonjsTypes)
                        this.files.types = this.files.commonjsTypes;
                }
            }
            outName = outName.replace(/.js/g, ".cjs");
            outName = outName.replace(/.map.js/g, ".map.cjs");
            outName = outName.replace(/.d.ts/g, ".d.cts");
            await utils.wait(500);
            if (this._target !== "both" && this._target !== "esm") {
                await clearFolder(utils.dirname(outName));
            }
            await writeCompileFile(outName, content);
        });
        console.timeEnd(tcolor.green("Compiled Commonjs"));
    }
    async esm(sourceCode, fileName, compilerOptions, isMain, hooks, isUpdate = true) {
        console.time(tcolor.green("Compiled ESM"));
        const _host = createHost(sourceCode, fileName);
        const createdFiles = _host.createdFiles;
        const host = _host.host;
        const program = ts.createProgram([fileName], compilerOptions, host);
        program.emit();
        Object.entries(createdFiles).map(async ([outName, content]) => {
            if (hooks?.length) {
                for (const hook of hooks) {
                    if (hook.async) {
                        content = await hook.func(content, outName);
                    }
                    else {
                        content = hook.func(content, outName);
                    }
                }
            }
            if (isUpdate) {
                if (outName.match(/.js/g)) {
                    this.files.esm = outName.replace(/.js/g, ".mjs");
                }
                if (outName.match(/.d.ts/g)) {
                    this.files.esmTypes = outName.replace(/.d.ts/g, ".d.mts");
                }
                if (isMain && this._target === "both" && this.files.esm) {
                    this.files.module = this.files.esm;
                }
            }
            outName = outName.replace(/.js/g, ".mjs");
            outName = outName.replace(/.map.js/g, ".map.mjs");
            outName = outName.replace(/.d.ts/g, ".d.mts");
            await utils.wait(500);
            if (this._target !== "commonjs") {
                await clearFolder(utils.dirname(outName));
            }
            await writeCompileFile(outName, content);
        });
        console.timeEnd(tcolor.green("Compiled ESM"));
    }
}
const depsCheck = {
    types(deps, compilerOptions) {
        if (!compilerOptions.noCheck) {
            const filePaths = deps.map((i) => i.file);
            let _err = false;
            const program = ts.createProgram(filePaths, compilerOptions);
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
                    const formatHost = {
                        getCurrentDirectory: () => process.cwd(),
                        getCanonicalFileName: (fileName) => fileName,
                        getNewLine: () => ts.sys.newLine,
                    };
                    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
                    _err = true;
                }
            }
            if (_err) {
                ts.sys.exit(1);
            }
            else {
                return true;
            }
        }
    },
    ext(deps) {
        const tsExt = new Set([".ts", ".mts", ".cts", ".tsx"]);
        for (const dep of deps) {
            const ext = utils.extname(dep.file);
            if (!tsExt.has(ext)) {
                console.error(tcolor.magenta(`${dep.file} has no valid TypeScript extension`));
                ts.sys.exit(1);
            }
        }
        return true;
    },
    moduleType(deps) {
        let _esmCount = 0;
        let cjsCount = 0;
        let unknowCount = 0;
        for (const dep of deps) {
            try {
                const sourceFile = ts.createSourceFile(dep.file, dep.content, ts.ScriptTarget.Latest, true);
                let hasESMImports = false;
                let hasCommonJS = false;
                function walk(node) {
                    if (ts.isImportDeclaration(node) ||
                        ts.isImportEqualsDeclaration(node) ||
                        ts.isExportDeclaration(node) ||
                        ts.isExportSpecifier(node) ||
                        ts.isExportAssignment(node)) {
                        hasESMImports = true;
                    }
                    if ((ts.isVariableStatement(node) ||
                        ts.isFunctionDeclaration(node) ||
                        ts.isInterfaceDeclaration(node) ||
                        ts.isTypeAliasDeclaration(node) ||
                        ts.isEnumDeclaration(node) ||
                        ts.isClassDeclaration(node)) &&
                        node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)) {
                        hasESMImports = true;
                    }
                    if (ts.isCallExpression(node)) {
                        if (ts.isIdentifier(node.expression) &&
                            node.expression.text === "require" &&
                            node.arguments.length > 0) {
                            hasCommonJS = true;
                        }
                    }
                    if (ts.isPropertyAccessExpression(node)) {
                        const text = node.getText(sourceFile);
                        if (text.startsWith("module.exports") ||
                            text.startsWith("exports.")) {
                            hasCommonJS = true;
                        }
                    }
                    ts.forEachChild(node, walk);
                }
                walk(sourceFile);
                if (hasESMImports && !hasCommonJS) {
                    _esmCount++;
                }
                else if (hasCommonJS && !hasESMImports) {
                    cjsCount++;
                }
                else if (hasESMImports && hasCommonJS) {
                    _esmCount++;
                }
            }
            catch (error) {
                console.error(tcolor.magenta(`Error checking module format for ${dep.file} : \n ${error}`));
                unknowCount++;
            }
        }
        if (unknowCount) {
            console.error(tcolor.magenta("Unknown error when checking module types in the dependencies tree."));
            ts.sys.exit(1);
        }
        if (cjsCount) {
            console.error(tcolor.magenta("The package detects CommonJs format  in the dependencies tree, that unsupported."));
            ts.sys.exit(1);
        }
        return true;
    },
    nodeCheck(nodeEnvOption, nodeModules) {
        if (!nodeEnvOption && nodeModules.length > 0) {
            console.error();
            ts.sys.exit(1);
        }
        return true;
    },
    async make(deps, compilerOptions, nodeModules, nodeEnv = true) {
        const res = resolves([
            [depsCheck.ext, deps],
            [depsCheck.nodeCheck, nodeEnv, nodeModules],
            [depsCheck.moduleType, deps],
            [depsCheck.types, deps, compilerOptions],
        ]);
        const results = await res.concurrent();
        return results.every((r) => r === true);
    },
};
async function getDependencies(entry) {
    const deps = await dependencies(entry);
    const sorted = deps.sort();
    const circularMessages = [];
    const nodeModules = deps.node();
    const depFiles = [];
    await utils.wait(100);
    for (const dep of sorted) {
        const file = utils.resolvePath(dep);
        const content = utils.readFile(file);
        depFiles.push({ file, content });
    }
    const circular = deps
        .mutual()
        .map((i) => `${i[0]} -> ${i[1]} \n ${i[1]} -> ${i[0]} \n`);
    const unknown = deps.warn().map((i) => `${i}\n`);
    if (circular.length)
        circularMessages.push(circular.join(""));
    if (unknown.length)
        circularMessages.push(unknown.join(""));
    return {
        depFiles,
        sorted,
        circularMessages,
        nodeModules,
    };
}
const getCompilerOptions = (exportPath, configPath) => {
    const config = new TsConfig(configPath);
    const generalOptions = () => config.getCompilerOptions();
    const commonjs = () => {
        const _config = new TsConfig(configPath);
        _config.addCompilerOptions({ outDir: "dist" });
        _config.removeCompilerOption("rootDir");
        _config.removeCompilerOption("module");
        const _options = _config.getCompilerOptions();
        let out_dir = _options.outDir;
        let isMain = true;
        if (exportPath !== ".") {
            out_dir = `${out_dir}/${exportPath.slice(2)}`;
            isMain = false;
        }
        const { outDir, module, ...restOptions } = _options;
        const compilerOptions = {
            outDir: out_dir,
            module: ts.ModuleKind.CommonJS,
            ...restOptions,
        };
        return {
            isMain,
            compilerOptions,
            out_dir,
        };
    };
    const esm = () => {
        const __config = new TsConfig(configPath);
        __config.addCompilerOptions({ outDir: "dist" });
        __config.removeCompilerOption("rootDir");
        const _options = __config.getCompilerOptions();
        let out_dir = _options.outDir;
        let isMain = true;
        if (exportPath !== ".") {
            out_dir = `${out_dir}/${exportPath.slice(2)}`;
            isMain = false;
        }
        const { outDir, module, ...restOptions } = _options;
        const compilerOptions = {
            outDir: out_dir,
            module: ts.ModuleKind.ES2022,
            ...restOptions,
        };
        return {
            isMain,
            compilerOptions,
            out_dir,
        };
    };
    return { commonjs, esm, generalOptions };
};
async function entry({ entryPath, exportPath, configPath, nodeEnv, }) {
    const deps = await getDependencies(entryPath);
    const depFiles = deps.depFiles;
    const nodeModules = deps.nodeModules;
    await utils.wait(1000);
    const opts = getCompilerOptions(exportPath, configPath);
    const generalOptions = opts.generalOptions();
    const modOpts = {
        commonjs: () => opts.commonjs(),
        esm: () => opts.esm(),
    };
    await utils.wait(1000);
    const checked = await depsCheck.make(depFiles, generalOptions, nodeModules, nodeEnv);
    if (!checked) {
        ts.sys.exit(1);
    }
    return {
        depFiles,
        modOpts,
        generalOptions,
    };
}
const getConfigPath = () => {
    const fileNames = ["susee.config.ts", "susee.config.js", "susee.config.mjs"];
    let configFile;
    for (const file of fileNames) {
        const _file = ts.sys.resolvePath(file);
        if (ts.sys.fileExists(_file)) {
            configFile = _file;
            break;
        }
    }
    return configFile;
};
function checkEntries(entries) {
    if (entries.length < 1) {
        console.error(tcolor.magenta(`No entry found in susee.config file, at least one entry required`));
        ts.sys.exit(1);
    }
    const objectStore = {};
    const duplicates = [];
    for (const obj of entries) {
        const value = obj.exportPath;
        if (objectStore[value]) {
            duplicates.push(`"${value}"`);
        }
        else {
            objectStore[value] = true;
        }
    }
    if (duplicates.length > 0) {
        console.error(tcolor.magenta(`Duplicate export paths/path (${duplicates.join(",")}) found in your susee.config file , that will error for bundled output`));
        ts.sys.exit(1);
    }
    for (const obj of entries) {
        if (!ts.sys.fileExists(ts.sys.resolvePath(obj.entry))) {
            console.error(tcolor.magenta(`Entry file ${obj.entry} dose not exists.`));
            ts.sys.exit(1);
        }
    }
}
async function getConfig() {
    const configPath = getConfigPath();
    if (configPath === undefined) {
        console.error(tcolor.magenta(`No susee.config file ("susee.config.ts", "susee.config.js", "susee.config.mjs") found`));
        ts.sys.exit(1);
    }
    const _default = await import(configPath);
    const config = _default.default;
    const entryCheck = resolves([[checkEntries, config.entryPoints]]);
    await entryCheck.series();
    await utils.wait(1000);
    return {
        entryPoints: config.entryPoints,
        postProcessHooks: config.postProcessHooks ?? [],
        allowUpdatePackageJson: config.allowUpdatePackageJson ?? true,
        nodeEnv: config.nodeEnv ?? true,
        renameDuplicates: config.renameDuplicates ?? true,
    };
}
const isCjs = (files) => files.commonjs && files.commonjsTypes;
const isEsm = (files) => files.esm && files.esmTypes;
function getExports(files, exportPath) {
    return isCjs(files) && isEsm(files)
        ? {
            [exportPath]: {
                import: {
                    default: `./${path.relative(process.cwd(), files.esm)}`,
                    types: `./${path.relative(process.cwd(), files.esmTypes)}`,
                },
                require: {
                    default: `./${path.relative(process.cwd(), files.commonjs)}`,
                    types: `./${path.relative(process.cwd(), files.commonjsTypes)}`,
                },
            },
        }
        : isCjs(files) && !isEsm(files)
            ? {
                [exportPath]: {
                    require: {
                        default: `./${path.relative(process.cwd(), files.commonjs)}`,
                        types: `./${path.relative(process.cwd(), files.commonjsTypes)}`,
                    },
                },
            }
            : !isCjs(files) && isEsm(files)
                ? {
                    [exportPath]: {
                        import: {
                            default: `./${path.relative(process.cwd(), files.esm)}`,
                            types: `./${path.relative(process.cwd(), files.esmTypes)}`,
                        },
                    },
                }
                : {};
}
async function writePackage(files, exportPath) {
    let isMain = true;
    if (exportPath !== ".") {
        isMain = false;
    }
    const pkgFile = utils.resolvePath("package.json");
    const _pkgtext = utils.readFile(pkgFile);
    const pkgtext = JSON.parse(_pkgtext);
    let { name, version, description, main, module, type, types, exports, ...rest } = pkgtext;
    await utils.wait(500);
    type = isEsm(files) ? "module" : "commonjs";
    let _main = {};
    let _module = {};
    let _types = {};
    let _exports = {};
    if (isMain) {
        _main = files.main
            ? { main: path.relative(process.cwd(), files.main) }
            : {};
        _module = files.module
            ? { module: path.relative(process.cwd(), files.module) }
            : {};
        _types = files.types
            ? { types: path.relative(process.cwd(), files.types) }
            : {};
        _exports = { exports: { ...getExports(files, exportPath) } };
    }
    else {
        _main = main ? { main: main } : {};
        _module = module ? { module: module } : {};
        _types = types ? { types: types } : {};
        const normalizedExports = exports && typeof exports === "object" && !Array.isArray(exports)
            ? { ...exports }
            : {};
        _exports = {
            exports: { ...normalizedExports, ...getExports(files, exportPath) },
        };
    }
    await utils.wait(1000);
    const pkgJson = {
        name,
        version,
        description,
        type,
        ..._main,
        ..._types,
        ..._module,
        ..._exports,
        ...rest,
    };
    utils.writeFile(pkgFile, JSON.stringify(pkgJson, null, 2));
}
async function susee() {
    const config = await getConfig();
    console.info(tcolor.cyan("Start Bundle"));
    const compile = async (e) => {
        const target = e.moduleType ? e.moduleType : "esm";
        const configPath = e.tsconfigFilePath;
        const ent = await entry({
            entryPath: e.entry,
            exportPath: e.exportPath,
            configPath: e.tsconfigFilePath,
            nodeEnv: config.nodeEnv,
        });
        const sourceCode = await bundler({
            depsFiles: ent.depFiles,
            compilerOptions: ent.generalOptions,
            renameDuplicates: config.renameDuplicates,
        });
        const mdOpts = ent.modOpts;
        const cjsOpts = mdOpts.commonjs();
        const esmOpts = mdOpts.esm();
        const compiler = new Compilers({ target, configPath });
        if (target === "commonjs") {
            await compiler.commonjs(sourceCode, e.entry, cjsOpts.compilerOptions, cjsOpts.isMain, config.postProcessHooks, config.allowUpdatePackageJson);
        }
        else if (target === "esm") {
            await compiler.esm(sourceCode, e.entry, esmOpts.compilerOptions, esmOpts.isMain, config.postProcessHooks, config.allowUpdatePackageJson);
        }
        else if (target === "both") {
            await compiler.esm(sourceCode, e.entry, esmOpts.compilerOptions, esmOpts.isMain, config.postProcessHooks, config.allowUpdatePackageJson);
            await utils.wait(1000);
            await compiler.commonjs(sourceCode, e.entry, cjsOpts.compilerOptions, cjsOpts.isMain, config.postProcessHooks, config.allowUpdatePackageJson);
        }
        await utils.wait(1000);
        if (config.allowUpdatePackageJson) {
            await writePackage(compiler.files, e.exportPath);
        }
    };
    for (const entry of config.entryPoints) {
        const entName = entry.exportPath === "." ? "main" : entry.exportPath.slice(2);
        await utils.wait(1000);
        console.info(tcolor.cyan(`Start ${tcolor.green("->")} "${entName}" export path`));
        await compile(entry);
        console.info(tcolor.cyan(`End ${tcolor.green("->")} "${entName}" export path`));
        if (config.entryPoints.indexOf(entry) + 1 < config.entryPoints.length) {
            console.info("-----------------------------------");
        }
    }
    console.info(tcolor.cyan("Finished Bundle"));
}
export { susee };
//# sourceMappingURL=index.js.map