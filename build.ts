import { exec } from "node:child_process";
import { susee } from "./src/index.js";
import { utilities } from "./src/lib/utils.js";
import path from "node:path";

async function writeBin() {
  const filePath = path.resolve(process.cwd(), "bin/index.mjs");
  const text = `#!/usr/bin/env node\nimport  {susee} from "../dist/index.mjs";\nawait susee();`;
  await utilities.writeCompileFile(filePath, text);
}

async function build() {
  await susee();
  await writeBin();
  await utilities.wait(1000);
  exec("chmod +x bin/index.mjs");
}

await build();
