import { build } from "./src/index.js";
import path from "node:path";
import fs from "node:fs";

async function writeBinary() {
  const binaryText = `#!/usr/bin/env node
import "../dist/cli/index.mjs";`;
  const binaryPath = path.resolve(process.cwd(), "bin/susee");
  const parentDir = path.dirname(binaryPath);
  if (fs.existsSync(binaryPath)) await fs.promises.unlink(binaryPath);
  if (!fs.existsSync(parentDir)) await fs.promises.mkdir(parentDir);
  await fs.promises.writeFile(binaryPath, binaryText);
  fs.promises.chmod(binaryPath, 0o777);
}

await build({
  entryPoints: [
    {
      entry: "src/index.ts",
      format: ["commonjs", "esm"],
      exportPath: ".",
    },
    {
      entry: "src/cli/index.ts",
      exportPath: "./cli",
    },
  ],
  allowUpdatePackageJson: true,
});

await writeBinary();
