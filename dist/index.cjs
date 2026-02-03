/*! *****************************************************************************
Copyright (c) Pho Thin Mg <phothinmg@disroot.org>

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0
***************************************************************************** */
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined)
        k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function () { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function (o, m, k, k2) {
    if (k2 === undefined)
        k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function (o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function (o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o)
                if (Object.prototype.hasOwnProperty.call(o, k))
                    ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule)
            return mod;
        var result = {};
        if (mod != null)
            for (var k = ownKeys(mod), i = 0; i < k.length; i++)
                if (k[i] !== "default")
                    __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.susee = susee;
const tsconfig_1 = __importDefault(require("@suseejs/tsconfig"));
const anonymous_1 = __importDefault(require("@suseejs/anonymous"));
const dependencies_1 = __importDefault(require("@suseejs/dependencies"));
const duplicates_1 = __importDefault(require("@suseejs/duplicates"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const resolves_1 = __importDefault(require("@phothinmaung/resolves"));
const tcolor_1 = __importDefault(require("@suseejs/tcolor"));
const transformer_1 = __importDefault(require("@suseejs/transformer"));
const typescript_1 = __importDefault(require("typescript"));
const utils_1 = __importDefault(require("@suseejs/utils"));
function removeExportExpressionHandler(compilerOptions) {
    return ({ file, content }) => {
        const sourceFile = typescript_1.default.createSourceFile(file, content, typescript_1.default.ScriptTarget.Latest, true);
        const transformer = (context) => {
            const { factory } = context;
            const visitor = (node) => {
                if (typescript_1.default.isFunctionDeclaration(node) ||
                    typescript_1.default.isClassDeclaration(node) ||
                    typescript_1.default.isInterfaceDeclaration(node) ||
                    typescript_1.default.isTypeAliasDeclaration(node) ||
                    typescript_1.default.isEnumDeclaration(node) ||
                    typescript_1.default.isVariableStatement(node)) {
                    const modifiers = node.modifiers?.filter((m) => m.kind !== typescript_1.default.SyntaxKind.ExportKeyword &&
                        m.kind !== typescript_1.default.SyntaxKind.DefaultKeyword);
                    if (modifiers?.length !== node.modifiers?.length) {
                        if (typescript_1.default.isFunctionDeclaration(node)) {
                            return factory.updateFunctionDeclaration(node, modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body);
                        }
                        if (typescript_1.default.isClassDeclaration(node)) {
                            return factory.updateClassDeclaration(node, modifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
                        }
                        if (typescript_1.default.isInterfaceDeclaration(node)) {
                            return factory.updateInterfaceDeclaration(node, modifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
                        }
                        if (typescript_1.default.isTypeAliasDeclaration(node)) {
                            return factory.updateTypeAliasDeclaration(node, modifiers, node.name, node.typeParameters, node.type);
                        }
                        if (typescript_1.default.isEnumDeclaration(node)) {
                            return factory.updateEnumDeclaration(node, modifiers, node.name, node.members);
                        }
                        if (typescript_1.default.isVariableStatement(node)) {
                            return factory.updateVariableStatement(node, modifiers, node.declarationList);
                        }
                    }
                }
                if (typescript_1.default.isExportDeclaration(node)) {
                    return factory.createEmptyStatement();
                }
                if (typescript_1.default.isExportAssignment(node)) {
                    const expr = node.expression;
                    if (typescript_1.default.isIdentifier(expr)) {
                        return factory.createEmptyStatement();
                    }
                }
                return typescript_1.default.visitEachChild(node, visitor, context);
            };
            return (rootNode) => typescript_1.default.visitNode(rootNode, visitor);
        };
        let _content = (0, transformer_1.default)(transformer, sourceFile, compilerOptions);
        _content = _content.replace(/^s*;\s*$/gm, "").trim();
        return { file, content: _content };
    };
}
function removeImportExpressionHandler(removedStatements, compilerOptions) {
    return ({ file, content }) => {
        const sourceFile = typescript_1.default.createSourceFile(file, content, typescript_1.default.ScriptTarget.Latest, true);
        const transformer = (context) => {
            const { factory } = context;
            const visitor = (node) => {
                if (typescript_1.default.isImportDeclaration(node)) {
                    const text = node.getText(sourceFile);
                    removedStatements.push(text);
                    return factory.createEmptyStatement();
                }
                if (typescript_1.default.isImportEqualsDeclaration(node)) {
                    const text = node.getText(sourceFile);
                    removedStatements.push(text);
                    return factory.createEmptyStatement();
                }
                return typescript_1.default.visitEachChild(node, visitor, context);
            };
            return (rootNode) => typescript_1.default.visitNode(rootNode, visitor);
        };
        let _content = (0, transformer_1.default)(transformer, sourceFile, compilerOptions);
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
        depsFiles = await duplicates_1.default.renamed(depsFiles, namesMap, callNameMap, importNameMap, exportNameMap, compilerOptions);
    }
    else {
        depsFiles = await duplicates_1.default.notRenamed(depsFiles, namesMap, compilerOptions);
    }
    await utils_1.default.wait(1000);
    depsFiles = await (0, anonymous_1.default)(depsFiles, exportDefaultExportNameMap, exportDefaultImportNameMap, compilerOptions);
    await utils_1.default.wait(1000);
    const removeImports = (0, resolves_1.default)([
        [removeImportExpressionHandler, removedStatements, compilerOptions],
    ]);
    const removeImport = await removeImports.concurrent();
    depsFiles = depsFiles.map(removeImport[0]);
    await utils_1.default.wait(1000);
    const removeExports = (0, resolves_1.default)([
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
        const file = `//${node_path_1.default.relative(process.cwd(), i.file)}`;
        return `${file}\n${i.content}`;
    })
        .join("\n")
        .trim();
    const mainFileContent = mainFile
        .map((i) => {
        const file = `//${node_path_1.default.relative(process.cwd(), i.file)}`;
        return `${file}\n${i.content}`;
    })
        .join("\n")
        .trim();
    await utils_1.default.wait(1000);
    const content = `${importStatements}\n${depFilesContent}\n${mainFileContent}`;
    return content;
}
function checkExports(file, str) {
    const sourceFile = typescript_1.default.createSourceFile(file, str, typescript_1.default.ScriptTarget.Latest, true);
    let nameExport = false;
    let defExport = false;
    const transformer = (context) => {
        const visitor = (node) => {
            if (typescript_1.default.isExportAssignment(node) &&
                !node.isExportEquals &&
                node.modifiers === undefined &&
                typescript_1.default.isIdentifier(node.expression)) {
                defExport = true;
            }
            else if (typescript_1.default.isFunctionDeclaration(node) ||
                typescript_1.default.isClassDeclaration(node)) {
                let exp = false;
                let def = false;
                node.modifiers?.forEach((mod) => {
                    if (mod.kind === typescript_1.default.SyntaxKind.ExportKeyword) {
                        exp = true;
                    }
                    if (mod.kind === typescript_1.default.SyntaxKind.DefaultKeyword) {
                        def = true;
                    }
                });
                if (exp && def)
                    defExport = true;
            }
            else if (typescript_1.default.isExportAssignment(node) &&
                typescript_1.default.isObjectLiteralExpression(node.expression)) {
                const pros = node.expression.properties;
                for (const pro of pros) {
                    if (pro.name && typescript_1.default.isIdentifier(pro.name)) {
                        defExport = true;
                    }
                }
            }
            else if (typescript_1.default.isNamedExports(node)) {
                nameExport = true;
            }
            else if (typescript_1.default.isVariableStatement(node) ||
                typescript_1.default.isFunctionDeclaration(node) ||
                typescript_1.default.isInterfaceDeclaration(node) ||
                typescript_1.default.isTypeAliasDeclaration(node)) {
                const isInsideNamespace = (n) => {
                    let current = n.parent;
                    while (current) {
                        if (typescript_1.default.isModuleDeclaration(current) &&
                            current.flags === typescript_1.default.NodeFlags.Namespace) {
                            return true;
                        }
                        current = current.parent;
                    }
                    return false;
                };
                node?.modifiers?.forEach((mod) => {
                    if (mod.kind === typescript_1.default.SyntaxKind.ExportKeyword) {
                        if (!isInsideNamespace(node)) {
                            nameExport = true;
                        }
                    }
                });
            }
            return typescript_1.default.visitEachChild(node, visitor, context);
        };
        return (rootNode) => typescript_1.default.visitNode(rootNode, visitor);
    };
    typescript_1.default.transform(sourceFile, [transformer]);
    return { nameExport, defExport };
}
const d_getCompilerOptions_1 = (exportPath, configPath) => {
    const config = new tsconfig_1.default(configPath);
    config.addCompilerOptions({ outDir: "dist" });
    config.removeCompilerOption("rootDir");
    const commonjs = () => {
        config.removeCompilerOption("module");
        const _options = config.getCompilerOptions();
        let out_dir = _options.outDir;
        let isMain = true;
        if (exportPath !== ".") {
            out_dir = `${out_dir}/${exportPath.slice(2)}`;
            isMain = false;
        }
        const { outDir, module, ...restOptions } = _options;
        const compilerOptions = {
            outDir: out_dir,
            module: typescript_1.default.ModuleKind.CommonJS,
            ...restOptions,
        };
        return {
            isMain,
            compilerOptions,
            out_dir,
        };
    };
    const esm = () => {
        const _options = config.getCompilerOptions();
        let out_dir = _options.outDir;
        let isMain = true;
        if (exportPath !== ".") {
            out_dir = `${out_dir}/${exportPath.slice(2)}`;
            isMain = false;
        }
        const { outDir, module, ...restOptions } = _options;
        const compilerOptions = {
            outDir: out_dir,
            module: _options.module && _options.module !== 1
                ? _options.module
                : typescript_1.default.ModuleKind.ES2022,
            ...restOptions,
        };
        return {
            isMain,
            compilerOptions,
            out_dir,
        };
    };
    return { commonjs, esm };
};
const createHost = (sourceCode, fileName) => {
    const createdFiles = {};
    const host = {
        getSourceFile: (file, languageVersion) => {
            if (file === fileName) {
                return typescript_1.default.createSourceFile(file, sourceCode, languageVersion);
            }
            return undefined;
        },
        writeFile: (fileName, contents) => {
            createdFiles[fileName] = contents;
        },
        getDefaultLibFileName: (options) => typescript_1.default.getDefaultLibFilePath(options),
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
    const sourceFile = typescript_1.default.createSourceFile(fileName, sourceCode, typescript_1.default.ScriptTarget.Latest, true);
    const transformer = (context) => {
        const { factory } = context;
        const visitor = (node) => {
            if (typescript_1.default.isExpressionStatement(node)) {
                const expr = node.expression;
                if (typescript_1.default.isBinaryExpression(expr) &&
                    typescript_1.default.isPropertyAccessExpression(expr.left) &&
                    typescript_1.default.isIdentifier(expr.left.expression) &&
                    expr.left.expression.escapedText === "exports" &&
                    typescript_1.default.isIdentifier(expr.left.name) &&
                    expr.left.name.escapedText === "default" &&
                    expr.operatorToken.kind === typescript_1.default.SyntaxKind.EqualsToken &&
                    typescript_1.default.isIdentifier(expr.right)) {
                    const newLeftExpr = factory.createIdentifier("module");
                    const newName = factory.createIdentifier("exports");
                    const newLeft = factory.updatePropertyAccessExpression(expr.left, newLeftExpr, newName);
                    const newExpr = factory.updateBinaryExpression(expr, newLeft, expr.operatorToken, expr.right);
                    return factory.updateExpressionStatement(node, newExpr);
                }
            }
            return typescript_1.default.visitEachChild(node, visitor, context);
        };
        return (rootNode) => typescript_1.default.visitNode(rootNode, visitor);
    };
    return (0, transformer_1.default)(transformer, sourceFile, compilerOptions);
}
function replaceInTs(fileName, sourceCode, compilerOptions) {
    const sourceFile = typescript_1.default.createSourceFile(fileName, sourceCode, typescript_1.default.ScriptTarget.Latest, true);
    const transformer = (context) => {
        const { factory } = context;
        const visitor = (node) => {
            if (typescript_1.default.isExportAssignment(node) &&
                node.modifiers === undefined &&
                !node.isExportEquals) {
                return factory.createExportAssignment(node.modifiers, true, node.expression);
            }
            return typescript_1.default.visitEachChild(node, visitor, context);
        };
        return (rootNode) => typescript_1.default.visitNode(rootNode, visitor);
    };
    return (0, transformer_1.default)(transformer, sourceFile, compilerOptions);
}
async function clearFolder(folderPath) {
    folderPath = node_path_1.default.resolve(process.cwd(), folderPath);
    try {
        const entries = await node_fs_1.default.promises.readdir(folderPath, {
            withFileTypes: true,
        });
        await Promise.all(entries.map((entry) => node_fs_1.default.promises.rm(node_path_1.default.join(folderPath, entry.name), {
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
    const filePath = typescript_1.default.sys.resolvePath(file);
    const dir = node_path_1.default.dirname(filePath);
    if (!typescript_1.default.sys.directoryExists(dir)) {
        await node_fs_1.default.promises.mkdir(dir, { recursive: true });
    }
    await utils_1.default.wait(500);
    await node_fs_1.default.promises.writeFile(filePath, content);
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
        console.time(tcolor_1.default.green("Compiled Commonjs"));
        const ck = checkExports(fileName, sourceCode);
        if (ck.defExport && ck.nameExport) {
            console.warn("Both name export and default export are exported from your project,that will effect on default export for commonjs output");
        }
        const _host = createHost(sourceCode, fileName);
        const createdFiles = _host.createdFiles;
        const host = _host.host;
        const program = typescript_1.default.createProgram([fileName], compilerOptions, host);
        program.emit();
        Object.entries(createdFiles).map(async ([outName, content]) => {
            if (ck.defExport && !ck.nameExport) {
                const ext = utils_1.default.extname(outName);
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
            await utils_1.default.wait(500);
            if (this._target !== "both" && this._target !== "esm") {
                await clearFolder(utils_1.default.dirname(outName));
            }
            await writeCompileFile(outName, content);
        });
        console.timeEnd(tcolor_1.default.green("Compiled Commonjs"));
    }
    async esm(sourceCode, fileName, compilerOptions, isMain, hooks, isUpdate = true) {
        console.time(tcolor_1.default.green("Compiled ESM"));
        const _host = createHost(sourceCode, fileName);
        const createdFiles = _host.createdFiles;
        const host = _host.host;
        const program = typescript_1.default.createProgram([fileName], compilerOptions, host);
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
            await utils_1.default.wait(500);
            if (this._target !== "commonjs") {
                await clearFolder(utils_1.default.dirname(outName));
            }
            await writeCompileFile(outName, content);
        });
        console.timeEnd(tcolor_1.default.green("Compiled ESM"));
    }
}
const suseeConfig = {
    entryPoints: [],
};
const depsCheck = {
    types(deps, compilerOptions) {
        if (!compilerOptions.noCheck) {
            const filePaths = deps.map((i) => i.file);
            let _err = false;
            const program = typescript_1.default.createProgram(filePaths, compilerOptions);
            for (const filePath of filePaths) {
                const sourceFile = program.getSourceFile(filePath);
                if (!sourceFile) {
                    console.error(tcolor_1.default.magenta(`File not found: ${filePath}`));
                    typescript_1.default.sys.exit(1);
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
                        getNewLine: () => typescript_1.default.sys.newLine,
                    };
                    console.error(typescript_1.default.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
                    _err = true;
                }
            }
            if (_err) {
                typescript_1.default.sys.exit(1);
            }
            else {
                return true;
            }
        }
    },
    ext(deps) {
        const tsExt = new Set([".ts", ".mts", ".cts", ".tsx"]);
        for (const dep of deps) {
            const ext = utils_1.default.extname(dep.file);
            if (!tsExt.has(ext)) {
                console.error(tcolor_1.default.magenta(`${dep.file} has no valid TypeScript extension`));
                typescript_1.default.sys.exit(1);
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
                const sourceFile = typescript_1.default.createSourceFile(dep.file, dep.content, typescript_1.default.ScriptTarget.Latest, true);
                let hasESMImports = false;
                let hasCommonJS = false;
                function walk(node) {
                    if (typescript_1.default.isImportDeclaration(node) ||
                        typescript_1.default.isImportEqualsDeclaration(node) ||
                        typescript_1.default.isExportDeclaration(node) ||
                        typescript_1.default.isExportSpecifier(node) ||
                        typescript_1.default.isExportAssignment(node)) {
                        hasESMImports = true;
                    }
                    if ((typescript_1.default.isVariableStatement(node) ||
                        typescript_1.default.isFunctionDeclaration(node) ||
                        typescript_1.default.isInterfaceDeclaration(node) ||
                        typescript_1.default.isTypeAliasDeclaration(node) ||
                        typescript_1.default.isEnumDeclaration(node) ||
                        typescript_1.default.isClassDeclaration(node)) &&
                        node.modifiers?.some((mod) => mod.kind === typescript_1.default.SyntaxKind.ExportKeyword)) {
                        hasESMImports = true;
                    }
                    if (typescript_1.default.isCallExpression(node)) {
                        if (typescript_1.default.isIdentifier(node.expression) &&
                            node.expression.text === "require" &&
                            node.arguments.length > 0) {
                            hasCommonJS = true;
                        }
                    }
                    if (typescript_1.default.isPropertyAccessExpression(node)) {
                        const text = node.getText(sourceFile);
                        if (text.startsWith("module.exports") ||
                            text.startsWith("exports.")) {
                            hasCommonJS = true;
                        }
                    }
                    typescript_1.default.forEachChild(node, walk);
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
                console.error(tcolor_1.default.magenta(`Error checking module format for ${dep.file} : \n ${error}`));
                unknowCount++;
            }
        }
        if (unknowCount) {
            console.error(tcolor_1.default.magenta("Unknown error when checking module types in the dependencies tree."));
            typescript_1.default.sys.exit(1);
        }
        if (cjsCount) {
            console.error(tcolor_1.default.magenta("The package detects CommonJs format  in the dependencies tree, that unsupported."));
            typescript_1.default.sys.exit(1);
        }
        return true;
    },
    nodeCheck(nodeEnvOption, nodeModules) {
        if (!nodeEnvOption && nodeModules.length > 0) {
            console.error();
            typescript_1.default.sys.exit(1);
        }
        return true;
    },
    async make(deps, compilerOptions, nodeModules, nodeEnv = true) {
        const res = (0, resolves_1.default)([
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
    const deps = await (0, dependencies_1.default)(entry);
    const sorted = deps.sort();
    const circularMessages = [];
    const nodeModules = deps.node();
    const depFiles = [];
    await utils_1.default.wait(100);
    for (const dep of sorted) {
        const file = utils_1.default.resolvePath(dep);
        const content = utils_1.default.readFile(file);
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
const d_getCompilerOptions_2 = (exportPath, configPath) => {
    const config = new tsconfig_1.default(configPath);
    const generalOptions = () => config.getCompilerOptions();
    const commonjs = () => {
        const _config = new tsconfig_1.default(configPath);
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
            module: typescript_1.default.ModuleKind.CommonJS,
            ...restOptions,
        };
        return {
            isMain,
            compilerOptions,
            out_dir,
        };
    };
    const esm = () => {
        const __config = new tsconfig_1.default(configPath);
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
            module: typescript_1.default.ModuleKind.ES2022,
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
    await utils_1.default.wait(1000);
    const opts = d_getCompilerOptions_2(exportPath, configPath);
    const generalOptions = opts.generalOptions();
    const modOpts = {
        commonjs: () => opts.commonjs(),
        esm: () => opts.esm(),
    };
    await utils_1.default.wait(1000);
    const checked = await depsCheck.make(depFiles, generalOptions, nodeModules, nodeEnv);
    if (!checked) {
        typescript_1.default.sys.exit(1);
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
        const _file = typescript_1.default.sys.resolvePath(file);
        if (typescript_1.default.sys.fileExists(_file)) {
            configFile = _file;
            break;
        }
    }
    return configFile;
};
function checkEntries(entries) {
    if (entries.length < 1) {
        console.error(tcolor_1.default.magenta(`No entry found in susee.config file, at least one entry required`));
        typescript_1.default.sys.exit(1);
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
        console.error(tcolor_1.default.magenta(`Duplicate export paths/path (${duplicates.join(",")}) found in your susee.config file , that will error for bundled output`));
        typescript_1.default.sys.exit(1);
    }
    for (const obj of entries) {
        if (!typescript_1.default.sys.fileExists(typescript_1.default.sys.resolvePath(obj.entry))) {
            console.error(tcolor_1.default.magenta(`Entry file ${obj.entry} dose not exists.`));
            typescript_1.default.sys.exit(1);
        }
    }
}
async function getConfig() {
    const configPath = getConfigPath();
    if (configPath === undefined) {
        console.error(tcolor_1.default.magenta(`No susee.config file ("susee.config.ts", "susee.config.js", "susee.config.mjs") found`));
        typescript_1.default.sys.exit(1);
    }
    const _default = await Promise.resolve(`${configPath}`).then(s => __importStar(require(s)));
    const config = _default.default;
    const entryCheck = (0, resolves_1.default)([[checkEntries, config.entryPoints]]);
    await entryCheck.series();
    await utils_1.default.wait(1000);
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
                    default: `./${node_path_1.default.relative(process.cwd(), files.esm)}`,
                    types: `./${node_path_1.default.relative(process.cwd(), files.esmTypes)}`,
                },
                require: {
                    default: `./${node_path_1.default.relative(process.cwd(), files.commonjs)}`,
                    types: `./${node_path_1.default.relative(process.cwd(), files.commonjsTypes)}`,
                },
            },
        }
        : isCjs(files) && !isEsm(files)
            ? {
                [exportPath]: {
                    require: {
                        default: `./${node_path_1.default.relative(process.cwd(), files.commonjs)}`,
                        types: `./${node_path_1.default.relative(process.cwd(), files.commonjsTypes)}`,
                    },
                },
            }
            : !isCjs(files) && isEsm(files)
                ? {
                    [exportPath]: {
                        import: {
                            default: `./${node_path_1.default.relative(process.cwd(), files.esm)}`,
                            types: `./${node_path_1.default.relative(process.cwd(), files.esmTypes)}`,
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
    const pkgFile = utils_1.default.resolvePath("package.json");
    const _pkgtext = utils_1.default.readFile(pkgFile);
    const pkgtext = JSON.parse(_pkgtext);
    let { name, version, description, main, module, type, types, exports, ...rest } = pkgtext;
    await utils_1.default.wait(500);
    type = isEsm(files) ? "module" : "commonjs";
    let _main = {};
    let _module = {};
    let _types = {};
    let _exports = {};
    if (isMain) {
        _main = files.main
            ? { main: node_path_1.default.relative(process.cwd(), files.main) }
            : {};
        _module = files.module
            ? { module: node_path_1.default.relative(process.cwd(), files.module) }
            : {};
        _types = files.types
            ? { types: node_path_1.default.relative(process.cwd(), files.types) }
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
    await utils_1.default.wait(1000);
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
    utils_1.default.writeFile(pkgFile, JSON.stringify(pkgJson, null, 2));
}
async function susee() {
    const config = await getConfig();
    console.info(tcolor_1.default.cyan("Start Bundle"));
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
            await utils_1.default.wait(1000);
            await compiler.commonjs(sourceCode, e.entry, cjsOpts.compilerOptions, cjsOpts.isMain, config.postProcessHooks, config.allowUpdatePackageJson);
        }
        await utils_1.default.wait(1000);
        if (config.allowUpdatePackageJson) {
            await writePackage(compiler.files, e.exportPath);
        }
    };
    for (const entry of config.entryPoints) {
        const entName = entry.exportPath === "." ? "main" : entry.exportPath.slice(2);
        await utils_1.default.wait(1000);
        console.info(tcolor_1.default.cyan(`Start ${tcolor_1.default.green("->")} "${entName}" export path`));
        await compile(entry);
        console.info(tcolor_1.default.cyan(`End ${tcolor_1.default.green("->")} "${entName}" export path`));
        if (config.entryPoints.indexOf(entry) + 1 < config.entryPoints.length) {
            console.info("-----------------------------------");
        }
    }
    console.info(tcolor_1.default.cyan("Finished Bundle"));
}
module.exports = susee;
