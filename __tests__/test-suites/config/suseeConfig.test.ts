import assert from "node:assert";
import { describe, it } from "node:test";
import ts from "typescript";
import {
  finalSuseeConfig,
  type BuildEntryPoint,
} from "../../../src/lib/suseeConfig.js";
import { exitWithCodeOneAndMessage, sortObject } from "../test_helpers.js";

describe("finalSuseeConfig", async () => {
  it("If duplicate path found in susee.config return exit with 0 and warn message if it is provide ", (_t, done) => {
    const filePath = "lib/get_config.ts";
    const cwd = process.cwd();
    const temp = ts.sys.resolvePath(
      "__tests__/test-suites/config/get_config/duplicate",
    );
    process.chdir(temp);
    try {
      exitWithCodeOneAndMessage(
        filePath,
        done,
        `\x1B[35mDuplicate export paths/path (".") found in your susee.config file or build options , that will error for bundled output\x1B[39m`,
      );
    } finally {
      process.chdir(cwd);
    }
  });
  // ===
  it("If empty entries in susee.config return exit with 0 and warn message if it is provide ", (_t, done) => {
    const temp = ts.sys.resolvePath(
      "__tests__/test-suites/config/get_config/empty_entries",
    );
    const filePath = "lib/get_config.ts";
    const cwd = process.cwd();
    process.chdir(temp);
    try {
      exitWithCodeOneAndMessage(
        filePath,
        done,
        "\x1B[35mNo entry found in susee.config file or build options, at least one entry required\x1B[39m",
      );
    } finally {
      process.chdir(cwd);
    }
  });
  // ===
  it("If no susee.config file found, return exit with 0 and warn message if it is provide ", (_t, done) => {
    const temp = ts.sys.resolvePath(
      "__tests__/test-suites/config/get_config/not_found",
    );
    const filePath = "lib/get_config.ts";
    const cwd = process.cwd();
    process.chdir(temp);
    try {
      exitWithCodeOneAndMessage(
        filePath,
        done,
        '\x1B[35mNo susee.config file ("susee.config.ts", "susee.config.js", "susee.config.mjs") found\x1B[39m',
      );
    } finally {
      process.chdir(cwd);
    }
  });
  // ===
  it("If one of entry file in susee.config file dose exits , return exit with 0 and warn message if it is provide ", (_t, done) => {
    const temp = ts.sys.resolvePath(
      "__tests__/test-suites/config/get_config/entry_not_found",
    );
    const filePath = "lib/get_config.ts";
    const cwd = process.cwd();
    process.chdir(temp);
    try {
      exitWithCodeOneAndMessage(
        filePath,
        done,
        "\x1B[35mEntry file src/config/index.ts dose not exists.\x1B[39m",
      );
    } finally {
      process.chdir(cwd);
    }
  });
  //==
  it("If no error", async () => {
    const temp = ts.sys.resolvePath(
      "__tests__/test-suites/config/get_config/ok",
    );
    const cwd = process.cwd();
    process.chdir(temp);
    try {
      const config = await finalSuseeConfig();
      const actual = sortObject(
        config.buildEntryPoints[0] as unknown as BuildEntryPoint,
      );
      assert.deepEqual(
        actual,
        sortObject({
          entry: "src/index.ts",
          exportPath: ".",
          format: ["esm", "commonjs"],
          outputDirectoryPath: "dist",
          plugins: [],
          rename: true,
          tsconfigFilePath: undefined,
          warning: false,
        }),
      );

      assert.deepEqual(config.updatePackage, false);
    } finally {
      process.chdir(cwd);
    }
  });
});
