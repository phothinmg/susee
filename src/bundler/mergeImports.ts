/*
Key Features:
Removes duplicate type imports: When both import ts from "typescript" and import type ts from "typescript" exist, only the regular import is kept.

Handles all import types:

Default imports (import x from "module")

Named imports (import { x, y } from "module")

Type imports (import type { x } from "module")

Namespace imports (import * as x from "module")

Preserves unique type imports: If a type import doesn't have a corresponding regular import, it's kept.

Merges named imports: Combines all named imports from the same module and removes duplicates.

Sorts imports: Outputs imports in alphabetical order for consistency.

The algorithm works by:

Parsing and categorizing all imports by type and module

For each module, checking if regular imports exist for type imports

Removing type imports that have corresponding regular imports

Keeping type imports that don't have regular equivalents

Generating clean, merged import statements
*/
function mergeImports(imports: string[]): string[] {
	const importMap = new Map<string, Set<string>>();
	const typeImportMap = new Map<string, Set<string>>();
	const defaultImports = new Map<string, Set<string>>();
	const typeDefaultImports = new Map<string, Set<string>>();
	const namespaceImports = new Map<string, Set<string>>();

	// Parse each import statement
	for (const importStr of imports) {
		const importMatch = importStr.match(
			/import\s+(?:type\s+)?(?:(.*?)\s+from\s+)?["']([^"']+)["'];?/,
		);
		if (!importMatch) continue;

		const [, importClause, _modulePath] = importMatch;
		const isTypeImport = importStr.includes("import type");
		const modulePath = _modulePath as string;

		if (!importClause) {
			// Default import or side-effect import
			const defaultMatch = importStr.match(/import\s+(?:type\s+)?(\w+)/);
			if (defaultMatch) {
				const importName = defaultMatch[1] as string;
				const targetMap = isTypeImport ? typeDefaultImports : defaultImports;
				if (!targetMap.has(modulePath)) targetMap.set(modulePath, new Set());
				targetMap.get(modulePath)?.add(importName);
			}
			continue;
		}

		if (importClause.startsWith("{")) {
			// Named imports: import { a, b } from 'module'
			const targetMap = isTypeImport ? typeImportMap : importMap;
			if (!targetMap.has(modulePath)) targetMap.set(modulePath, new Set());

			const names = importClause
				.replace(/[{}]/g, "")
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			// biome-ignore  lint/suspicious/useIterableCallbackReturn : just add name for names each
			names.forEach((name) => targetMap.get(modulePath)?.add(name));
		} else if (importClause.startsWith("* as")) {
			// Namespace import: import * as name from 'module'
			const namespaceMatch = importClause.match(/\*\s+as\s+(\w+)/);
			if (namespaceMatch) {
				const namespaceName = namespaceMatch[1] as string;
				if (!namespaceImports.has(modulePath))
					namespaceImports.set(modulePath, new Set());
				namespaceImports.get(modulePath)?.add(namespaceName);
			}
		} else {
			// Default import: import name from 'module'
			const targetMap = isTypeImport ? typeDefaultImports : defaultImports;
			if (!targetMap.has(modulePath)) targetMap.set(modulePath, new Set());
			targetMap.get(modulePath)?.add(importClause.trim());
		}
	}

	const mergedImports: string[] = [];

	// Process named imports - remove type imports that have regular imports
	for (const [modulePath, regularNames] of importMap) {
		const typeNames = typeImportMap.get(modulePath) || new Set();

		// Only include type names that don't have regular imports
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

	// Add remaining type-only imports (where no regular imports exist for the module)
	for (const [modulePath, typeNames] of typeImportMap) {
		if (!importMap.has(modulePath) && typeNames.size > 0) {
			const importNames = Array.from(typeNames).sort().join(", ");
			mergedImports.push(
				`import type { ${importNames} } from "${modulePath}";`,
			);
		}
	}

	// Process default imports - remove type default imports that have regular default imports
	for (const [modulePath, regularDefaultNames] of defaultImports) {
		const typeDefaultNames = typeDefaultImports.get(modulePath) || new Set();

		// Only include type default names that don't have regular default imports
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

	// Add remaining type-only default imports
	for (const [modulePath, typeDefaultNames] of typeDefaultImports) {
		if (!defaultImports.has(modulePath) && typeDefaultNames.size > 0) {
			const importNames = Array.from(typeDefaultNames).join(", ");
			mergedImports.push(`import type ${importNames} from "${modulePath}";`);
		}
	}

	// Process namespace imports
	for (const [modulePath, names] of namespaceImports) {
		if (names.size > 0) {
			const importNames = Array.from(names).join(", ");
			mergedImports.push(`import * as ${importNames} from "${modulePath}";`);
		}
	}

	return mergedImports.sort();
}

export default mergeImports;
