import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { susee } from "./src/index.js";

async function grantCli() {
  const file = path.resolve(process.cwd(), "bin/index.mjs");
  const shebang = "#!/usr/bin/env node";
  if (fs.existsSync(file)) {
    let content = await fs.promises.readFile(file, "utf8");
    if (!content.startsWith(shebang)) {
      content = `${shebang}\n${content}`;
      await fs.promises.writeFile(file, content);
    }
  }
}

await susee();
const cliCommand =
  "npx tsx susee-cli/index.ts build susee-cli/index.ts --outdir bin";

await new Promise<void>((resolve, reject) => {
  exec(cliCommand, async (error) => {
    if (error) {
      reject(error);
      return;
    }

    try {
      await grantCli();
      await fs.promises.chmod(
        path.resolve(process.cwd(), "bin/index.mjs"),
        0o755,
      );
      resolve();
    } catch (chmodOrGrantError) {
      reject(chmodOrGrantError);
    }
  });
});
