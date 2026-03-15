import { exec } from "node:child_process";
import fs from "node:fs";
import lcovToCodecov from "./lcov.js";

const testScript =
	"npx tsx --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=lcov.info";

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
		if (fs.existsSync("lcov.info")) {
			const lcov = await fs.promises.readFile("lcov.info", "utf8");
			const codecov = lcovToCodecov(lcov);
			const codecovPath = "coverage/codecov.json";
			if (fs.existsSync(codecovPath)) {
				await fs.promises.unlink(codecovPath);
			}
			if (!fs.existsSync("coverage")) {
				await fs.promises.mkdir("coverage");
			}
			await fs.promises.writeFile(codecovPath, JSON.stringify(codecov));
		}
	},
	async () => {
		if (fs.existsSync("lcov.info")) {
			await fs.promises.unlink("lcov.info");
		}
	},
];

for (const job of jobs) {
	await job();
}
