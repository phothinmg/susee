import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { executeCommand } from "./execute-command.js";
import tcolor from "../../src/lib/utils/tcolor.js";

const suseeTestOptions = [
  {
    message: "Project : Run all *.test.ts files",
    script:
      "npx tsx --test --test-reporter=./__tests__/runner/susee-reporter.ts __tests__/test-suites/**/*.test.ts",
  },
  {
    message: "Initialization : Tests for Initialization step",
    script:
      "npx tsx --test --test-reporter=./__tests__/runner/susee-reporter.ts __tests__/test-suites/initialization/**/*.test.ts",
  },
  {
    message: "Bundle : Tests for Bundle step",
    script:
      "npx tsx --test --test-reporter=./__tests__/runner/susee-reporter.ts __tests__/test-suites/bundle/**/*.test.ts",
  },
  {
    message: "Coverage : generate coverage report for codecov",
    script: "npx tsx ./__tests__/lcov/index.ts",
  },
];

async function suseeTests() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log("> Please select a test option:");
  suseeTestOptions.forEach((opt, i) =>
    console.log(`   ${i + 1}. ${tcolor.cyan(opt.message)}`),
  );

  const choice = await rl.question("   Enter number: ");
  const index = parseInt(choice) - 1;

  if (suseeTestOptions[index]) {
    await executeCommand(suseeTestOptions[index].script);
  } else {
    console.log(tcolor.red("   Invalid selection."));
  }

  rl.close();
}

suseeTests();
