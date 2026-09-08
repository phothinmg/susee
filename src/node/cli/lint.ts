import {
  suseeLint,
  logError,
  logInfo,
  logWarning,
  type LintOptions,
  type LintResult,
} from "@suseejs/susee_bundler";
import { generateFinalBuildOptions } from "../config/index.js";

async function suseeCheck() {
  const buildOptions = await generateFinalBuildOptions();
  const lintOptions: LintOptions = {
    checkAnonymous: true,
    checkDefaultExports: true,
    checkNpmInstalled: true,
  };
  for (const point of buildOptions.buildEntryPoints) {
    const result: LintResult = suseeLint(point.entry, ".", lintOptions);

    for (const diag of result.errors) {
      const location = `${diag.file}:${diag.line}:${diag.column}`;
      const details = diag.details.length
        ? `\n${diag.details.map((d) => `  ${d}`).join("\n")}`
        : "";
      logError(
        `[${diag.rule}] ${location} — ${diag.message}${details}`,
        diag.rule,
      );
    }
    for (const diag of result.warnings) {
      const location = `${diag.file}:${diag.line}:${diag.column}`;
      const details = diag.details.length
        ? `\n${diag.details.map((d) => `  ${d}`).join("\n")}`
        : "";
      logWarning(`[${diag.rule}] ${location} — ${diag.message}${details}`);
    }

    if (result.errors.length === 0 && result.warnings.length === 0) {
      logInfo(`All checks passed for ${point.entry}`);
    }
  }
}

export { suseeCheck };
