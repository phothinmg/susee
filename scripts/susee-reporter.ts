import { type TestEvent } from "node:test/reporters";
import tcolor from "susee-tcolor";

type SummaryCounts = {
	suites: number;
	tests: number;
	passed: number;
	failed?: number;
	skipped?: number;
	todo?: number;
	cancelled: number;
};

type SummaryEventData = {
	counts: SummaryCounts;
	duration_ms?: number;
};

export default async function* suseeTestReporter(
	source: AsyncIterable<TestEvent>,
): AsyncGenerator<string> {
	let finalSummary: SummaryEventData | null = null;
	const errorMessages = new Set<string>();

	for await (const event of source) {
		switch (event.type) {
			case "test:fail":
				{
					const failData = event.data as {
						name?: string;
						details?: { error?: { message?: string } | string };
					};
					const failureName = failData.name ?? "Test failed";
					const rawError = failData.details?.error;
					const errorText =
						typeof rawError === "string"
							? rawError
							: (rawError?.message ?? "Unknown error");
					errorMessages.add(`${failureName}: ${errorText}`);
				}
				break;
			case "test:stderr":
				{
					const stderrData = event.data as { message?: string };
					const message = stderrData.message?.trim();
					if (message) {
						errorMessages.add(message);
					}
				}
				break;
			case "test:summary":
				finalSummary = event.data as SummaryEventData;
				break;
		}
	}

	if (finalSummary) {
		const counts = finalSummary.counts;
		const durationMs = finalSummary.duration_ms ?? 0;
		yield `> ${tcolor.cyan("suites")} : ${counts.suites}\n  ${tcolor.cyan("tests")} : ${counts.tests}\n  ${tcolor.cyan("passed")} : ${counts.passed}\n  ${tcolor.cyan("failed")} : ${counts.failed ?? 0}\n  ${tcolor.cyan("skipped")} : ${counts.skipped ?? 0}\n  ${tcolor.cyan("todo")} : ${counts.todo ?? 0}\n  ${tcolor.cyan("cancelled")} : ${counts.cancelled}\n  ${tcolor.cyan("duration_ms")} : ${durationMs}\n`;
	}

	if (errorMessages.size > 0) {
		yield `${tcolor.red("errors")} :\n`;
		for (const errorMessage of errorMessages) {
			yield `  ${tcolor.red("-")} ${tcolor.red(errorMessage)}\n`;
		}
	}
}
