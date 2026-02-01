import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";

async function setupTempDir(name: string) {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `susee-${name}-`));
	await fs.mkdir(tmpDir, { recursive: true });
	return tmpDir;
}

async function readJson(filePath: string) {
	const content = await fs.readFile(filePath, "utf8");
	return JSON.parse(content);
}

async function fileExists(filePath: string) {
	try {
		await fs.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

const isObject = (input: any) =>
	typeof input === "object" && !Array.isArray(input) && input !== null;

function expect(entry: any) {
	const hasOwn = (input: any) => {
		if (!isObject(entry)) assert.fail(`${entry} is not an object`);
		assert.ok(Object.hasOwn(entry, input));
	};
	const isInstanceOf = (input: any) => {
		if (typeof input === "string") {
			assert.ok(typeof entry === input);
		} else {
			assert.ok(entry instanceof input);
		}
	};
	const hasLength = (input: number) => {
		const length: number | undefined = isObject(entry)
			? Object.keys(entry).length
			: (entry?.length ?? undefined);
		if (length) {
			assert.ok(length >= input);
		} else {
			assert.fail(`${typeof entry}`);
		}
	};

	return { hasOwn, isInstanceOf, hasLength };
}

function exitWithCodeOneAndMessage(
	filePath: string,
	done: (result?: any) => void,
	message?: string,
) {
	exec(`tsx ${filePath}`, (err, stdout, stderr) => {
		try {
			assert(err instanceof Error, "Process should exit with an error");
			// Assert the exit code is 1 (Node.js sets err.code on the Error object)
			assert.strictEqual(err.code, 1, "Exit code should be 1");
			if (message) {
				// Assert the stderr output contains the warning message
				assert.strictEqual(
					stderr.trim(),
					message,
					"Stderr should contain the warning message",
				);
			}

			// Assert stdout is empty in this case
			assert.strictEqual(stdout.trim(), "", "Stdout should be empty");

			done();
		} catch (err) {
			done(err);
		}
	});
}

function exitWithCodeZeroAndMessage(
	filePath: string,
	done: (result?: any) => void,
	message?: string,
) {
	exec(`tsx ${filePath}`, (err, stdout, stderr) => {
		try {
			// err should be null if the process exited with code 0
			assert.strictEqual(err, null, "Process should exit without an error");

			if (message) {
				// Assert stdout contains the success message
				assert.strictEqual(
					stdout.trim(),
					message,
					"Stdout should contain the success message",
				);
			}

			// Assert stderr is empty
			assert.strictEqual(stderr.trim(), "", "Stderr should be empty");

			done();
		} catch (err) {
			done(err);
		}
	});
}

export {
	setupTempDir,
	readJson,
	fileExists,
	expect,
	exitWithCodeOneAndMessage,
	exitWithCodeZeroAndMessage,
};
