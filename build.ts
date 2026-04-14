import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { susee } from "./src/index.js";
import { files } from "./src/lib/utils/files.js";

const ef = "dist/bin/index.mjs";
const bf = "bin/susee";

async function grantCli() {
  const file = path.resolve(process.cwd(), ef);
  const shebang = "#!/usr/bin/env node";
  if (fs.existsSync(file)) {
    let content = await fs.promises.readFile(file, "utf8");
    if (!content.startsWith(shebang)) {
      content = `${shebang}\n${content}`;
      await fs.promises.writeFile(file, content);
    }
  }
}

async function writeBinary() {
  const content = `#!/usr/bin/env node\n\nimport("../dist/bin/index.mjs");`;
  await files.writeFile(bf, content);
}

await susee();
const cliCommand =
  "npx tsx src/cli/index.ts build src/cli/index.ts --format esm --outdir dist/bin --minify";

await new Promise<void>((resolve, reject) => {
  exec(cliCommand, async (error) => {
    if (error) {
      reject(error);
      return;
    }

    try {
      await grantCli();
      await fs.promises.chmod(path.resolve(process.cwd(), ef), 0o755);
      await writeBinary();
      await fs.promises.chmod(path.resolve(process.cwd(), bf), 0o755);
      resolve();
    } catch (chmodOrGrantError) {
      reject(chmodOrGrantError);
    }
  });
});
