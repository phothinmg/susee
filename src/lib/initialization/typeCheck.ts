import resolves from "@phothinmaung/resolves";
import tcolor from "@suseejs/tcolor";
import ts from "typescript";
import type { DependenciesFiles } from "../types.js";

function _typesCheck(
	dep: DependenciesFiles,
	compilerOptions: ts.CompilerOptions,
) {
	if (!compilerOptions.noCheck) {
		const filePaths = dep.map((i) => i.file);
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

async function typeCheck(
	dep: DependenciesFiles,
	compilerOptions: ts.CompilerOptions,
) {
	const res = resolves([[_typesCheck, dep, compilerOptions]]);
	const result = await res.series();
	return result[0];
}

export default typeCheck;
