import resolves from "@phothinmaung/resolves";
import utils from "@suseejs/utils";
import { exec } from "node:child_process";
import { susee } from "./src/index.js";
import { writeCompileFile } from "./src/compiler/write.js";

async function writeBin() {
  const filePath = utils.resolvePath("bin/index.mjs");
  const text = `#!/usr/bin/env node\nimport { susee } from "../dist/index.mjs";\nawait susee();`;
  await writeCompileFile(filePath, text);
}

async function build() {
  const jobs = resolves([[susee], [writeBin]]);
  await jobs.series();
  await utils.wait(100);
  exec("chmod +x bin/index.mjs");
}

await build();
