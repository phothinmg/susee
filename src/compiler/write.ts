import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import utils from "@suseejs/utils";

async function clearFolder(folderPath: string) {
  folderPath = path.resolve(process.cwd(), folderPath);
  try {
    const entries = await fs.promises.readdir(folderPath, {
      withFileTypes: true,
    });
    await Promise.all(
      entries.map((entry) =>
        fs.promises.rm(path.join(folderPath, entry.name), {
          recursive: true,
        }),
      ),
    );
  } catch (error) {
    // biome-ignore lint/suspicious/noExplicitAny: error code
    if ((error as any).code !== "ENOENT") {
      throw error;
    }
  }
}

async function writeCompileFile(file: string, content: string) {
  const filePath = ts.sys.resolvePath(file);
  const dir = path.dirname(filePath);
  if (!ts.sys.directoryExists(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
  await utils.wait(500);
  await fs.promises.writeFile(filePath, content);
}

export { writeCompileFile, clearFolder };
