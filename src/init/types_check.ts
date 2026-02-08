import tcolor from "@suseejs/tcolor";
import ts from "typescript";
import type { DepsFile } from "../types_def.js";

export default function typesCheck(
	deps: DepsFile[],
	compilerOptions: ts.CompilerOptions,
) {
	if (!compilerOptions.noCheck) {
		const filePaths = deps.map((i) => i.file);
		let _err = false;
		// Create program
		const program = ts.createProgram(filePaths, compilerOptions);
		// Check each file individually for immediate feedback
		for (const filePath of filePaths) {
			const sourceFile = program.getSourceFile(filePath);
			if (!sourceFile) {
				console.error(tcolor.magenta(`File not found: ${filePath}`));
				ts.sys.exit(1);
			}

			const diagnostics = [
				...program.getSyntacticDiagnostics(sourceFile),
				...program.getSemanticDiagnostics(sourceFile),
				...program.getDeclarationDiagnostics(sourceFile),
			];

			if (diagnostics.length > 0) {
				const formatHost: ts.FormatDiagnosticsHost = {
					getCurrentDirectory: () => process.cwd(),
					getCanonicalFileName: (fileName) => fileName,
					getNewLine: () => ts.sys.newLine,
				};
				console.error(
					ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost),
				);
				_err = true;
			}
		}
		if (_err) {
			ts.sys.exit(1);
		} else {
			return true;
		}
	}
}
