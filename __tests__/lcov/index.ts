import { exec } from "node:child_process";
import fs from "node:fs";
import lcovToCodecov from "./lcov.js";

const lcovFile = "__tests__/lcov/lcov.info";

const testScript = `npx tsx --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=${lcovFile}`;

const jobs = [
  async () => {
    await new Promise<void>((resolve, reject) => {
      const cp = exec(testScript);
      cp.stdout?.pipe(process.stdout);
      cp.stderr?.pipe(process.stderr);
      cp.once("error", (error) => reject(error));
      cp.once("close", (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            `Coverage tests failed (code: ${code ?? "null"}, signal: ${signal ?? "none"})`,
          ),
        );
      });
    });
  },
  async () => {
    if (fs.existsSync(lcovFile)) {
      const lcov = await fs.promises.readFile(lcovFile, "utf8");
      const codecov = lcovToCodecov(lcov);
      const codecovPath = "__tests__/coverage/codecov.json";
      if (fs.existsSync(codecovPath)) {
        await fs.promises.unlink(codecovPath);
      }
      if (!fs.existsSync("__tests__/coverage")) {
        await fs.promises.mkdir("__tests__/coverage");
      }
      await fs.promises.writeFile(codecovPath, JSON.stringify(codecov));
    }
  },
  async () => {
    if (fs.existsSync(lcovFile)) {
      await fs.promises.unlink(lcovFile);
    }
  },
];

for (const job of jobs) {
  await job();
}
