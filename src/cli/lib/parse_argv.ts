import path from "node:path";
import { fail } from "./fail.js";

export function isFile(entry: string) {
	const exts = [".js", ".ts", ".mts", ".mjs"];
	return exts.includes(path.extname(entry));
}

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

export function parseArgs(argv: any[]) {
	const opts: {
		entry: string;
		outDir?: string | undefined;
		format?: "commonjs" | "esm" | undefined;
		tsconfig?: string | undefined;
		rename?: boolean | undefined;
		allowUpdate?: boolean | undefined;
		minify?: boolean | undefined;
	} = {
		entry: "",
	};
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index] as string;
		if (index === 0 && !argument.startsWith("--") && isFile(argument)) {
			opts["entry"] = argument;
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
				opts["entry"] = value as string;
				if (inlineValue === undefined) {
					index += 1;
				}
				break;
			case "--outdir":
				if (!value || value.startsWith("--"))
					fail("Output directory required.");
				opts["outDir"] = value;
				if (inlineValue === undefined) {
					index += 1;
				}
				break;
			case "--format":
				if (value !== "cjs" && value !== "commonjs" && value !== "esm") {
					fail("Format must be cjs, commonjs, or esm.");
				}
				opts["format"] =
					value === "cjs"
						? "commonjs"
						: (value as "commonjs" | "esm" | undefined);
				if (inlineValue === undefined) {
					index += 1;
				}
				break;
			case "--tsconfig":
				if (!value || value.startsWith("--")) fail("Tsconfig path required.");
				opts["tsconfig"] = value;
				if (inlineValue === undefined) {
					index += 1;
				}
				break;
			case "--rename":
				if (inlineValue !== undefined) {
					opts["rename"] = parseBooleanFlag("rename", inlineValue);
				} else if (nextValue === "true" || nextValue === "false") {
					opts["rename"] = parseBooleanFlag("rename", nextValue);
					index += 1;
				} else {
					opts["rename"] = true;
				}
				break;
			case "--allow-update":
				if (inlineValue !== undefined) {
					opts["allowUpdate"] = parseBooleanFlag("allow update", inlineValue);
				} else if (nextValue === "true" || nextValue === "false") {
					opts["allowUpdate"] = parseBooleanFlag("allow update", nextValue);
					index += 1;
				} else {
					opts["allowUpdate"] = true;
				}
				break;
			case "--minify":
				if (inlineValue !== undefined) {
					opts["minify"] = parseBooleanFlag("minify", inlineValue);
				} else if (nextValue === "true" || nextValue === "false") {
					opts["minify"] = parseBooleanFlag("minify", nextValue);
					index += 1;
				} else {
					opts["minify"] = true;
				}
				break;
		}
	}
	if (isEmptyObject(opts) || opts.entry === "") {
		fail("Entry point required");
	}
	return opts;
}
