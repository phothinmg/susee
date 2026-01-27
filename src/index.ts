import fs from "node:fs";
import bundle from "./bundle";
import Compilers from "./compilers";
import { clearFolder, getEntryPath, wait } from "./helpers";
import writePackage from "./package";
import type { Target } from "./types";

namespace susee {
	export type PostProcessHook =
		| {
				async: true;
				func: (code: string, file?: string) => Promise<string>;
		  }
		| {
				async: false;
				func: (code: string, file?: string) => string;
		  };
	/**
	 * Build configuration.
	 */
	export interface BuildOptions {
		/**
		 * Entry file to bundle.
		 */
		entry: string;
		/**
		 * Output target: `"commonjs"`, `"esm"`, or `"both"`.
		 *
		 * default - "both"
		 */
		target?: Target;
		/**
		 * Default export name if applicable.
		 * - Required when the entry has default export and `options.target` = `"commonjs"` or `"both"`
		 *
		 * Example :
		 *
		 * ```ts
		 * const foo = {bar:"foo"};
		 * export default foo; // defaultExportName = "foo"
		 * ```
		 *
		 * default - undefined
		 */
		defaultExportName?: string | undefined;
		/**
		 * Whether this build represents the main export , otherwise subpath export.
		 *
		 * default - true
		 */
		isMainExport?: boolean;
		/**
		 * Output directory.
		 *
		 * For a subpath export (not the main export), `outDir` must be a single-level
		 * nested folder under the main output directory.
		 *
		 * Example:
		 *
		 * ```ts
		 * const mainOutdir = "dist";
		 * const subpathOutdir = "dist/subpath"; // subpath export in package.json will be "./subpath"
		 * const fooOutdir = "dist/foo"; // subpath export in package.json will be "./foo"
		 * ```
		 *
		 * default - "dist"
		 */
		outDir?: string;
		/**
		 * Identifiers to replace with blanks during compilation.
		 *
		 * default - []
		 */
		replaceWithBlank?: string[];
		/**
		 * Array of hook functions executed during compilation.
		 *
		 * default - []
		 */
		hooks?: PostProcessHook[];
	}

	/**
	 * Builds the given entry file and writes outputs plus `package.json` updates.
	 *
	 * Example :
	 *
	 * ```ts
	 * import fooHook from "foo-hook"
	 *
	 * await susee.build({
	 * entry: "src/index.ts",
	 * outDir: "dist",
	 * target: "both",
	 * defaultExportName: "myLib",
	 * hooks: [fooHook()],
	 * })
	 * ```
	 *
	 */
	export async function build({
		entry,
		target = "both",
		defaultExportName = undefined,
		outDir = "dist",
		isMainExport = true,
		replaceWithBlank = [],
		hooks = [],
	}: BuildOptions) {
		console.time("Build Time");
		if (fs.existsSync(outDir)) {
			await clearFolder(outDir);
		}
		entry = getEntryPath(entry);
		let doubleExport = false;
		const compiler = new Compilers();
		if (target === "commonjs") {
			const bun = await bundle(entry, false);
			await compiler.commonjs(
				bun.code,
				entry,
				outDir,
				isMainExport,
				defaultExportName,
				replaceWithBlank,
				hooks,
			);
			doubleExport = bun.dexport;
		} else if (target === "esm") {
			const bun2 = await bundle(entry, true);
			await compiler.esm(bun2.code, entry, outDir, isMainExport, hooks);
		} else if (target === "both") {
			const bun = await bundle(entry, false);
			await compiler.commonjs(
				bun.code,
				entry,
				outDir,
				isMainExport,
				defaultExportName,
				replaceWithBlank,
				hooks,
			);
			doubleExport = bun.dexport;
			await wait(1000);
			const bun2 = await bundle(entry, true);
			await compiler.esm(bun2.code, entry, outDir, isMainExport, hooks);
		}
		await wait(1000);
		await writePackage(compiler.files, isMainExport, outDir);
		if (doubleExport) {
			console.warn(
				"Found both `Name Export` and `Default Export` at entry,that will lose `Name Export` in commonjs output. ",
			);
		}
		console.timeEnd("Build Time");
	}
}

export default susee;
