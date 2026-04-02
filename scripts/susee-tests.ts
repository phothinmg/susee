import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { executeCommand } from "./execute-command.js";
import tcolor from "susee-tcolor";

const suseeTestOptions = [
  {
    message: "Project : run all *.test.ts files",
    script:
      "npx tsx --test --test-reporter=./scripts/susee-reporter.ts tests/**/*.test.ts",
  },
  {
    message: "Initialization : tests for Initialization step",
    script:
      "npx tsx --test --test-reporter=./scripts/susee-reporter.ts tests/initialization/**/*.test.ts",
  },
  {
    message: "Bundle : tests for Bundle step",
    script:
      "npx tsx --test --test-reporter=./scripts/susee-reporter.ts tests/bundle/**/*.test.ts",
  },
  {
    message: "Coverage : generate coverage report for codecov",
    script: "npx tsx ./scripts/codecov/index.ts",
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
