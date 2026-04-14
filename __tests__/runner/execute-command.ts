import { stdout, stderr } from "node:process";
import { exec } from "node:child_process";

export async function executeCommand(scriptText: string) {
	await new Promise<void>((resolve, reject) => {
		const cp = exec(scriptText);
		cp.stdout?.pipe(stdout);
		cp.stderr?.pipe(stderr);
		cp.once("error", (error) => reject(error));
		cp.once("close", (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`Failed to execute ${scriptText}, (code: ${code ?? "null"}, signal: ${signal ?? "none"})`,
				),
			);
		});
	});
}
