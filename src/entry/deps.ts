import dependencies from "@suseejs/dependencies";
import type SuSee from "@suseejs/types";
import utils from "@suseejs/utils";

/**
 * Resolves dependencies for a given entry.
 * @param {string} entry - The entry point to resolve dependencies for.
 * @returns {Promise<{depFiles: SuSee.DepsFile[],sorted: string[],circularMessages: string[];nodeModules: string[]}>} - A promise that resolves with an object containing the sorted dependencies and warning messages.
 */
async function getDependencies(entry: string): Promise<{
  depFiles: SuSee.DepsFile[];
  sorted: string[];
  circularMessages: string[];
  nodeModules: string[];
}> {
  const deps = await dependencies(entry);
  const sorted = deps.sort();
  const circularMessages: string[] = [];
  const nodeModules = deps.node();
  const depFiles: SuSee.DepsFile[] = [];

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

  if (circular.length) circularMessages.push(circular.join(""));
  if (unknown.length) circularMessages.push(unknown.join(""));

  return {
    depFiles,
    sorted,
    circularMessages,
    nodeModules,
  };
}

export default getDependencies;
