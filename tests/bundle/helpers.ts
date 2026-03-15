import path from "node:path";
import type { DependenciesFile } from "@suseejs/types";
export function createDepFile(file: string, content: string): DependenciesFile {
	return {
		file,
		content,
		length: content.length,
		includeDefExport: /export\s+default|export\s*=/.test(content),
		size: {
			logical: Buffer.byteLength(content, "utf8"),
			allocated: null,
			utf8: Buffer.byteLength(content, "utf8"),
			buffBytes: Buffer.byteLength(content, "utf8"),
		},
		moduleType: "esm",
		fileExt: path.extname(file) as ".ts",
		isJsx: false,
	};
}
