import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { exec } from "node:child_process";
import { executeCommand } from "./execute-command.js";
import tcolor from "susee-tcolor";

const suseeCommitTypes = [
  "🚀 Added",
  "🖊️ Changed",
  "🗝️ Deprecated",
  "🐞 Fixed",
  "🚨 Security",
  "✨ Modified",
];

async function getCommandOutput(command: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    exec(command, (error, stdoutData) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdoutData.trim());
    });
  });
}

async function getNextCommitNumber(): Promise<number> {
  const subjects = await getCommandOutput('git log --all --format="%s"');
  const matches = subjects.match(/\(#(\d+)\)/g) ?? [];
  let maxNumber = 0;

  for (const match of matches) {
    const numberMatch = match.match(/\d+/);
    if (!numberMatch) {
      continue;
    }
    const value = Number.parseInt(numberMatch[0], 10);
    if (!Number.isNaN(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return maxNumber + 1;
}

async function getCurrentBranch(): Promise<string> {
  const branch = await getCommandOutput("git branch --show-current");
  if (!branch) {
    throw new Error("Could not determine current branch.");
  }
  return branch;
}

async function suseeCommit() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    console.log("> Please select a commit type:");
    suseeCommitTypes.forEach((opt, i) =>
      console.log(`   ${i + 1}. ${tcolor.cyan(opt)}`),
    );
    const choice = await rl.question("   Enter number: ");
    const index = Number.parseInt(choice, 10) - 1;
    if (!suseeCommitTypes[index]) {
      console.log(tcolor.red("   Invalid selection."));
      return;
    }

    const type = suseeCommitTypes[index];
    const message = await rl.question("   Enter commit message: ");
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      console.log(tcolor.red("   Commit message cannot be empty."));
      return;
    }

    const newMessageNum = await getNextCommitNumber();
    const branch = await getCurrentBranch();
    const commitMessage = `${type}: ${trimmedMessage} (#${newMessageNum})`;

    await executeCommand("npx tsx scripts/codecov/index.ts");

    await executeCommand("git add .");
    await executeCommand(`git commit -m "${commitMessage}"`);
    await executeCommand(`git push origin ${branch}`);

    console.log(
      tcolor.green(`   Pushed ${branch} with commit #${newMessageNum}.`),
    );
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    console.log(tcolor.red(`   ${text}`));
  } finally {
    rl.close();
  }
}

suseeCommit();
