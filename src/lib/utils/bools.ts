import module from "node:module";

/**
 * Check if a given module is a Node.js built-in module.
 * @param {string} input - The module to check.
 * @returns {boolean} True if the module is a Node.js built-in module, false otherwise.
 */
const isNodeBuiltinModule = (input: string): boolean => {
	const nodeModuleSpecifier: string = "node:";
	const nodeBuiltinModules = new Set<string>(module.builtinModules);
	return input.startsWith(nodeModuleSpecifier) || nodeBuiltinModules.has(input);
};

export { isNodeBuiltinModule };
