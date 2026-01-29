import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import Compilers from "./compilers";
import * as help from "./helpers";

const compiler = new Compilers();

const entry = "src/index.ts";
const outDir = "dist";

async function build() {
  if (fs.existsSync(outDir)) {
    await help.clearFolder(outDir);
  }
  const sourceCode = await fs.promises.readFile(
    path.resolve(process.cwd(), entry),
    "utf8",
  );
  await help.wait(1000);
  await compiler.commonjs(
    sourceCode,
    entry,
    path.resolve(process.cwd(), outDir),
    true,
    "utils",
    [],
  );
  await help.wait(1000);
  await compiler.esm(
    sourceCode,
    entry,
    path.resolve(process.cwd(), outDir),
    true,
    [],
  );
}

await build();
