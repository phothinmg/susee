import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { printHelp } from "../../src/cli/print_help.js";

describe("printHelp", () => {
  test("prints usage information to stdout", () => {
    const output: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      output.push(args.join(" "));
    };
    try {
      printHelp();
    } finally {
      console.log = origLog;
    }
    const text = output.join("\n");
    assert.ok(text.includes("Susee CLI"), "should include 'Susee CLI' title");
    assert.ok(text.includes("Usage:"), "should include Usage section");
    assert.ok(text.includes("--entry"), "should list --entry option");
    assert.ok(text.includes("--outdir"), "should list --outdir option");
    assert.ok(text.includes("--format"), "should list --format option");
    assert.ok(text.includes("--minify"), "should list --minify option");
    assert.ok(text.includes("--check"), "should list --check option");
    assert.ok(text.includes("--tsconfig"), "should list --tsconfig option");
    assert.ok(text.includes("--allow-update"), "should list --allow-update option");
  });
});