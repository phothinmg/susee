// cSpell:disable
import path from "node:path";
import resolves from "@phothinmaung/resolves";
import transformFunction from "@suseejs/transformer";
import type {
  BundleHandler,
  DepsFile,
  NamesSets,
  DuplicatesNameMap,
} from "@suseejs/types";
import utilities from "@suseejs/utils";
import ts from "typescript";

// construct maps
const namesMap: DuplicatesNameMap = new Map();
const callNameMap: NamesSets = [];
const importNameMap: NamesSets = [];
const exportNameMap: NamesSets = [];

function __uniqueName() {
  const storedPrefix: Map<string, string> = new Map();

  const obj = {
    setPrefix({ key, value }: { key: string; value: string }) {
      const names: string[] = [];
      let _fix: string | undefined;

      if (storedPrefix.has(key)) {
        console.warn(`${key} already exist`);
        throw new Error();
      } else {
        _fix = value;
        storedPrefix.set(key, value);
      }
      function getName(input: string) {
        const length = names.length;
        const _name = _fix
          ? `${_fix}${input}_${length + 1}`
          : `$nyein${input}_${length + 1}`;
        names.push(_name);
        return _name;
      }
      return { getName };
    },
    getPrefix(key: string) {
      if (storedPrefix.has(key)) {
        return storedPrefix.get(key);
      }
    },
  };
  return obj;
}

const dupName = __uniqueName().setPrefix({
  key: "DuplicatesNames",
  value: "__duplicatesNames__",
});

const normalizePathKey = (filePath: string) => {
  const parsed = path.parse(filePath);
  let noExt = path.join(parsed.dir, parsed.name);
  if (parsed.name === "index") {
    noExt = parsed.dir;
  }
  return path.normalize(noExt);
};

const getFileKey = (filePath: string) => normalizePathKey(filePath);

const getModuleKeyFromSpecifier = (
  moduleSpecifier: ts.Expression,
  sourceFile: ts.SourceFile,
  containingFile: string,
) => {
  let spec = "";
  if (ts.isStringLiteral(moduleSpecifier)) {
    spec = moduleSpecifier.text;
  } else {
    spec = moduleSpecifier.getText(sourceFile).replace(/^['"]|['"]$/g, "");
  }
  if (spec.startsWith(".") || spec.startsWith("/")) {
    const baseDir = path.dirname(containingFile);
    return normalizePathKey(path.resolve(baseDir, spec));
  }
  return spec;
};

const callExpression = (compilerOptions: ts.CompilerOptions): BundleHandler => {
  return ({ file, content, ...rest }: DepsFile): DepsFile => {
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      const { factory } = context;
      const visitor = (node: ts.Node): ts.Node => {
        if (ts.isCallExpression(node)) {
          if (ts.isIdentifier(node.expression)) {
            const base = node.expression.text;
            let new_name: string | null = null;
            const mapping = callNameMap.find(
              (m) => m.base === base && m.file === file,
            );
            const importMapping = importNameMap.find(
              (m) => m.base === base && m.file === file,
            );
            if (mapping) {
              new_name = mapping.newName;
            } else if (importMapping) {
              new_name = importMapping.newName;
              //flag.push(new_name);
            }
            if (new_name) {
              return factory.updateCallExpression(
                node,
                factory.createIdentifier(new_name),
                node.typeArguments,
                node.arguments,
              );
            }
          }
        } else if (ts.isPropertyAccessExpression(node)) {
          if (ts.isIdentifier(node.expression)) {
            const base = node.expression.text;
            let new_name: string | null = null;
            const mapping = callNameMap.find(
              (m) => m.base === base && m.file === file,
            );
            const importMapping = importNameMap.find(
              (m) => m.base === base && m.file === file,
            );
            if (mapping) {
              new_name = mapping.newName;
            } else if (importMapping) {
              new_name = importMapping.newName;
            }
            if (new_name) {
              return factory.updatePropertyAccessExpression(
                node,
                factory.createIdentifier(new_name),
                node.name,
              );
            }
          }
        } else if (ts.isNewExpression(node)) {
          if (ts.isIdentifier(node.expression)) {
            const base = node.expression.text;
            let new_name: string | null = null;
            const mapping = callNameMap.find(
              (m) => m.base === base && m.file === file,
            );
            const importMapping = importNameMap.find(
              (m) => m.base === base && m.file === file,
            );
            if (mapping) {
              new_name = mapping.newName;
            } else if (importMapping) {
              new_name = importMapping.newName;
            }
            if (new_name) {
              return factory.updateNewExpression(
                node,
                factory.createIdentifier(new_name),
                node.typeArguments,
                node.arguments,
              );
            }
          }
        }
        /* ----------------------Returns for visitor function------------------------------- */
        return ts.visitEachChild(node, visitor, context);
      }; // visitor;
      /* --------------------Returns for transformer function--------------------------------- */
      return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
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

const exportExpression = (
  compilerOptions: ts.CompilerOptions,
): BundleHandler => {
  return ({ file, content, ...rest }: DepsFile): DepsFile => {
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      const { factory } = context;
      const visitor = (node: ts.Node): ts.Node => {
        if (ts.isExportSpecifier(node)) {
          if (ts.isIdentifier(node.name)) {
            const base = node.name.text;
            let new_name: string | null = null;
            const mapping = callNameMap.find(
              (m) => m.base === base && m.file === file,
            );
            const importMapping = importNameMap.find(
              (m) => m.base === base && m.file === file,
            );
            if (mapping) {
              exportNameMap.push({
                base,
                file: getFileKey(file),
                newName: mapping.newName,
              });
              new_name = mapping.newName;
            } else if (importMapping) {
              new_name = importMapping.newName;
            }
            if (new_name) {
              return factory.updateExportSpecifier(
                node,
                node.isTypeOnly,
                node.propertyName,
                factory.createIdentifier(new_name),
              );
            }
          }
        } else if (ts.isExportAssignment(node)) {
          const expr = node.expression;
          if (ts.isIdentifier(expr)) {
            const base = expr.text;
            let new_name: string | null = null;
            const mapping = callNameMap.find(
              (m) => m.base === base && m.file === file,
            );
            const importMapping = importNameMap.find(
              (m) => m.base === base && m.file === file,
            );
            if (mapping) {
              exportNameMap.push({
                base,
                file: getFileKey(file),
                newName: mapping.newName,
              });
              new_name = mapping.newName;
            } else if (importMapping) {
              new_name = importMapping.newName;
            }
            if (new_name) {
              return factory.updateExportAssignment(
                node,
                node.modifiers,
                factory.createIdentifier(new_name),
              );
            }
          }
        }
        /* ----------------------Returns for visitor function------------------------------- */
        return ts.visitEachChild(node, visitor, context);
      }; // visitor;
      /* --------------------Returns for transformer function--------------------------------- */
      return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
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

const importExpression = (
  compilerOptions: ts.CompilerOptions,
): BundleHandler => {
  return ({ file, content, ...rest }: DepsFile): DepsFile => {
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      const { factory } = context;
      const visitor = (node: ts.Node): ts.Node => {
        if (ts.isImportDeclaration(node)) {
          const moduleKey = getModuleKeyFromSpecifier(
            node.moduleSpecifier,
            sourceFile,
            file,
          );
          let baseNames: string[] = [];
          if (
            node.importClause?.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings)
          ) {
            baseNames = node.importClause.namedBindings.elements.map((el) =>
              el.name.text.trim(),
            );
          }
          // import default expression
          if (
            node.importClause?.name &&
            ts.isIdentifier(node.importClause.name)
          ) {
            const base = node.importClause.name.text.trim();
            const mapping = exportNameMap.find(
              (m) => m.base === base && m.file === moduleKey,
            );
            if (mapping) {
              importNameMap.push({
                base: mapping.base,
                file,
                newName: mapping.newName,
              });
              const newImportClause = factory.updateImportClause(
                node.importClause,
                node.importClause.phaseModifier,
                factory.createIdentifier(mapping.newName),
                node.importClause.namedBindings,
              );
              return factory.updateImportDeclaration(
                node,
                node.modifiers,
                newImportClause,
                node.moduleSpecifier,
                node.attributes,
              );
            }
          }
          // import name , `import{ ... }`
          if (
            baseNames.length > 0 &&
            node.importClause &&
            node.importClause.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings)
          ) {
            const updatedElements =
              node.importClause.namedBindings.elements.map((el) => {
                const mapping = exportNameMap.find(
                  (m) => m.base === el.name.text.trim() && m.file === moduleKey,
                );

                if (mapping) {
                  importNameMap.push({
                    base: mapping.base,
                    file,
                    newName: mapping.newName,
                  });
                  return factory.updateImportSpecifier(
                    el,
                    el.isTypeOnly,
                    el.propertyName,
                    factory.createIdentifier(mapping.newName),
                  );
                }
                return el;
              });
            const newNamedImports = factory.updateNamedImports(
              node.importClause.namedBindings,
              updatedElements,
            );
            const newImportClause = factory.updateImportClause(
              node.importClause,
              node.importClause.phaseModifier,
              node.importClause.name,
              newNamedImports,
            );
            return factory.updateImportDeclaration(
              node,
              node.modifiers,
              newImportClause,
              node.moduleSpecifier,
              node.attributes,
            );
          }
        } //&&
        /* ----------------------Returns for visitor function------------------------------- */
        return ts.visitEachChild(node, visitor, context);
      }; // visitor;
      /* --------------------Returns for transformer function--------------------------------- */
      return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
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

const collector = (compilerOptions: ts.CompilerOptions): BundleHandler => {
  return ({ file, content, ...rest }: DepsFile): DepsFile => {
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

const updater = (compilerOptions: ts.CompilerOptions): BundleHandler => {
  return ({ file, content, ...rest }: DepsFile): DepsFile => {
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
          const newDeclarations = node.declarationList.declarations.map(
            (decl) => {
              if (ts.isIdentifier(decl.name)) {
                const base = decl.name.text;
                // biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
                if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
                  const newName = dupName.getName(base);
                  callNameMap.push({ base, file, newName });
                  return factory.updateVariableDeclaration(
                    decl,
                    factory.createIdentifier(newName),
                    decl.exclamationToken,
                    decl.type,
                    decl.initializer,
                  );
                }
              }
              return decl;
            },
          );
          const newDeclList = factory.updateVariableDeclarationList(
            node.declarationList,
            newDeclarations,
          );
          return factory.updateVariableStatement(
            node,
            node.modifiers,
            newDeclList,
          );
        } else if (ts.isFunctionDeclaration(node)) {
          if (node.name && ts.isIdentifier(node.name)) {
            const base = node.name.text;
            // biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
            if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
              const newName = dupName.getName(base);
              callNameMap.push({ base, file, newName });
              return factory.updateFunctionDeclaration(
                node,
                node.modifiers,
                node.asteriskToken,
                factory.createIdentifier(newName),
                node.typeParameters,
                node.parameters,
                node.type,
                node.body,
              );
            }
          }
        } else if (ts.isClassDeclaration(node)) {
          if (node.name && ts.isIdentifier(node.name)) {
            const base = node.name.text;
            // biome-ignore  lint/style/noNonNullAssertion : namesMap.has(base) before that get just only size
            if (namesMap.has(base) && namesMap.get(base)!.size > 1) {
              const newName = dupName.getName(base);
              callNameMap.push({ base, file, newName });
              return factory.updateClassDeclaration(
                node,
                node.modifiers,
                factory.createIdentifier(newName),
                node.typeParameters,
                node.heritageClauses,
                node.members,
              );
            }
          }
        }
        /* ----------------------Returns for visitor function------------------------------- */
        return ts.visitEachChild(node, visitor, context);
      }; // visitor;
      /* --------------------Returns for transformer function--------------------------------- */
      return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
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

const duplicateHandlers = {
  /**
   * A bundle handler that takes a list of source files and transforms them into renamed source files.
   * The transformation is done in a series of steps, each step transforms the source files based on the given maps.
   * The order of the steps is important, as it will determine the final output.
   * @param deps - A list of source files to be transformed.
   * @param namesMap - A map of base names to new names for function calls, import expressions, and export expressions.
   * @param callNameMap - A map of base names to new names for call expressions.
   * @param importNameMap - A map of base names to new names for import expressions.
   * @param exportNameMap - A map of base names to new names for export expressions.
   * @param compilerOptions - The options for the TypeScript compiler.
   * @returns A list of transformed source files.
   */
  renamed: async (
    deps: DepsFile[],

    compilerOptions: ts.CompilerOptions,
  ): Promise<DepsFile[]> => {
    // order is important here
    const duplicates = resolves([
      [collector, compilerOptions],
      [updater, compilerOptions],
      [callExpression, compilerOptions],
      [exportExpression, compilerOptions],
      [importExpression, compilerOptions],
      [callExpression, compilerOptions],
      [exportExpression, compilerOptions],
    ]);
    const duplicate = await duplicates.concurrent();
    for (const func of duplicate) {
      deps = deps.map(func);
    }
    return deps;
  },
  /**
   * A bundle handler that takes a list of source files and checks if they have been renamed correctly.
   * If a source file has not been renamed, an error will be thrown.
   * @param deps - A list of source files to be checked.
   * @param namesMap - A map of base names to new names for function calls, import expressions, and export expressions.
   * @param compilerOptions - The options for the TypeScript compiler.
   * @returns A list of source files that have been renamed correctly.
   */
  notRenamed: async (
    deps: DepsFile[],

    compilerOptions: ts.CompilerOptions,
  ): Promise<DepsFile[]> => {
    let _err = false;
    const duplicates = resolves([[collector, namesMap, compilerOptions]]);
    const duplicate = await duplicates.concurrent();
    deps.map(duplicate[0]);
    await utilities.wait(1000);
    namesMap.forEach((files, name) => {
      if (files.size > 1) {
        _err = true;
        console.warn(`Name -> ${name} declared in multiple files :`);
        // biome-ignore lint/suspicious/useIterableCallbackReturn : just log warn
        files.forEach((f) => console.warn(`  - ${f.file}`));
      }
    });
    await utilities.wait(500);
    if (_err) {
      process.exit(1);
    }
    return deps;
  },
};

export default duplicateHandlers;
