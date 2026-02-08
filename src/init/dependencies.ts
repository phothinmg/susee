import dependencies from "@suseejs/dependencies";
import ts from "typescript";
import fs from "node:fs";
import utilities from "../utils.js";
import type { DepsFile } from "../types_def.js";

export default async function generateDependencies(entryFile: string) {
  const deps = await dependencies(entryFile);
  const sorted = deps.sort(); // get dependencies graph
  const includeNodeModules = deps.node().length > 0;
  const depFiles: DepsFile[] = [];

  await utilities.wait(1000);

  for (const dep of sorted) {
    const file = ts.sys.resolvePath(dep);
    const content = await fs.promises.readFile(file, "utf8");
    depFiles.push({ file, content });
  }
  return {
    includeNodeModules,
    depFiles,
  };
}
