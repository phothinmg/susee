import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { executeCommand } from "./execute-command.js";
import tcolor from "@suseejs/tcolor";

const suseeCommitTypes = [
  "Added",
  "Changed",
  "Deprecated",
  "Fixed",
  "Security",
];

const commits: number[] = [135];

async function suseeCommit() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log("> Please select a commit types:");
  suseeCommitTypes.forEach((opt, i) =>
    console.log(`   ${i + 1}. ${tcolor.cyan(opt)}`),
  );
  const choice = await rl.question("   Enter number: ");
  const index = parseInt(choice) - 1;
  if (suseeCommitTypes[index]) {
    const type = suseeCommitTypes[index];
    const message = await rl.question("   Enter commit message: ");
    const currentMessageNum = commits.slice(-1)[0] as number;
    const newMessageNum = currentMessageNum + 1;
    commits.push(newMessageNum);
    const commitMessage = `git commit -m "${type}: ${message} (#${newMessageNum})"`;
    await executeCommand(commitMessage);
  } else {
    console.log(tcolor.red("   Invalid selection."));
  }
}

suseeCommit();
