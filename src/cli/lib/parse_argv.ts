import path from "node:path";
import type { SuseePlugin, SuseePluginFunction } from "@suseejs/type";
import { fail } from "./fail.js";

interface CliOptions {
	entry: string;
	outDir?: string | undefined;
	format?: "commonjs" | "esm" | undefined;
	tsconfig?: string | undefined;
	rename?: boolean | undefined;
	allowUpdate?: boolean | undefined;
	minify?: boolean | undefined;
	warning?: boolean | undefined;
}

export function isFile(entry: string) {
	const exts = [".js", ".ts", ".mts", ".mjs", ".cjs", ".cts"];
	return exts.includes(path.extname(entry));
}
// biome-ignore lint/suspicious/noExplicitAny: unknown
export function isEmptyObject(entry: any) {
	return (
		typeof entry === "object" &&
		!Array.isArray(entry) &&
		Object.keys(entry).length === 0
	);
}

export function parseBooleanFlag(flag: string, value: string) {
	if (value === "true") return true;
	if (value === "false") return false;
	fail(`Type of ${flag} must be boolean.`);
}
// biome-ignore lint/suspicious/noExplicitAny: unknown
export function parseArgs(argv: any[]) {
	const opts: CliOptions = {
		entry: "",
	};
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index] as string;
		if (index === 0 && !argument.startsWith("--") && isFile(argument)) {
			opts.entry = argument;
			continue;
		}
		const [flag, inlineValue] = argument.split("=", 2);
		const nextValue = argv[index + 1] as string | undefined;
		const value = inlineValue ?? nextValue;
		switch (flag) {
			case "--entry":
				if (!value || value.startsWith("--")) fail("Entry point required.");
				if (opts.entry !== "" && isFile(opts.entry))
					fail("Entry point already exists.");
				opts.entry = value as string;
				if (inlineValue === undefined) {
					index += 1;
				}
				break;
			case "--outdir":
				if (!value || value.startsWith("--"))
					fail("Output directory required.");
				opts.outDir = value;
				if (inlineValue === undefined) {
					index += 1;
				}
				break;
			case "--format":
				if (value !== "cjs" && value !== "commonjs" && value !== "esm") {
					fail("Format must be cjs, commonjs, or esm.");
				}
				opts.format =
					value === "cjs"
						? "commonjs"
						: (value as "commonjs" | "esm" | undefined);
				if (inlineValue === undefined) {
					index += 1;
				}
				break;
			case "--tsconfig":
				if (!value || value.startsWith("--")) fail("Tsconfig path required.");
				opts.tsconfig = value;
				if (inlineValue === undefined) {
					index += 1;
				}
				break;
			case "--rename":
				if (inlineValue !== undefined) {
					opts.rename = parseBooleanFlag("rename", inlineValue);
				} else if (nextValue === "true" || nextValue === "false") {
					opts.rename = parseBooleanFlag("rename", nextValue);
					index += 1;
				} else {
					opts.rename = true;
				}
				break;
			case "--allow-update":
				if (inlineValue !== undefined) {
					opts.allowUpdate = parseBooleanFlag("allow update", inlineValue);
				} else if (nextValue === "true" || nextValue === "false") {
					opts.allowUpdate = parseBooleanFlag("allow update", nextValue);
					index += 1;
				} else {
					opts.allowUpdate = true;
				}
				break;
			case "--minify":
				if (inlineValue !== undefined) {
					opts.minify = parseBooleanFlag("minify", inlineValue);
				} else if (nextValue === "true" || nextValue === "false") {
					opts.minify = parseBooleanFlag("minify", nextValue);
					index += 1;
				} else {
					opts.minify = true;
				}
				break;
			case "--warning":
				if (inlineValue !== undefined) {
					opts.warning = parseBooleanFlag("warning", inlineValue);
				} else if (nextValue === "true" || nextValue === "false") {
					opts.warning = parseBooleanFlag("warning", nextValue);
					index += 1;
				} else {
					opts.warning = true;
				}
				break;
		}
	}
	if (isEmptyObject(opts) || opts.entry === "") {
		fail("Entry point required");
	}
	return opts;
}
export interface CliBuildOptions {
	entry: string;
	outDir: string;
	format: "commonjs" | "esm";
	tsconfig: string | undefined;
	rename: boolean;
	allowUpdate: boolean;
	minify: boolean;
	warning: boolean;
	plugins: (SuseePlugin | SuseePluginFunction)[];
}

export function getDefaultOptions(args: CliOptions): CliBuildOptions {
	const entry = args.entry;
	const outDir = args.outDir ?? "dist";
	const format = args.format ?? "esm";
	const tsconfig = args.tsconfig ?? undefined;
	const rename = args.rename ?? true;
	const allowUpdate = args.allowUpdate ?? false;
	const minify = args.minify ?? false;
	const warning = args.warning ?? false;
	return {
		entry,
		outDir,
		format,
		tsconfig,
		rename,
		allowUpdate,
		minify,
		warning,
		plugins: [],
	};
}
