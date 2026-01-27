import path from "node:path";
import ts from "typescript";
import fs from "node:fs";

const resolvePath = ts.sys.resolvePath;
const fileExists = ts.sys.fileExists;
const deleteFile = ts.sys.deleteFile;
const directoryExists = ts.sys.directoryExists;
const createDirectory = ts.sys.createDirectory;
const writeFile = ts.sys.writeFile;
const readFile = ts.sys.readFile;

const wait = (time: number) =>
  new Promise((resolve) => setTimeout(resolve, time));
const writeOutFile = (filePath: string, content: string) => {
  const resolvedPath = resolvePath(filePath);
  const dir = path.dirname(resolvedPath);
  if (fileExists(resolvedPath) && typeof deleteFile === "function") {
    deleteFile(resolvedPath);
  } else {
    if (!directoryExists(dir)) {
      createDirectory(dir);
    } else {
      if (typeof deleteFile === "function") {
        deleteFile(resolvedPath);
      }
    }
  }
  writeFile(resolvedPath, content);
};

function getEntryPath(entry: string) {
  const match = entry.match(/^\.+/);
  if (match) {
    const length = match[0].length + 1;
    return entry.slice(length).trim();
  } else {
    return entry;
  }
}

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
    if ((error as any).code !== "ENOENT") {
      throw error;
    }
  }
}

export { wait, writeOutFile, readFile, resolvePath, getEntryPath, clearFolder };
