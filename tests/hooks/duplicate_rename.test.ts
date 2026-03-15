import { describe, it } from "node:test";
import ts from "typescript";
import bundle from "../../src/lib/bundle/index.js";
import initializer from "../../src/lib/initialization/index.js";

describe("Rename Duplicates", () => {
  it("rename and called in property assignment", async (t) => {
    const cwd = process.cwd();
    const temp = ts.sys.resolvePath(
      "tests/bundle/duplicate_rename/property_assignment",
    );
    process.chdir(temp);
    try {
      const int = await initializer();
      const bund = await bundle(int);
      const actual = bund.points[0]?.sourceCode;
      const expected = `//src/foo.ts\nfunction _dupName_due_1() {\n    return "Hello world";\n}\nconst foo = _dupName_due_1();\n//src/index.ts\nconst _dupName_due_2 = "Hey I'am the first one!!";\nexport const gg = {\n    aa: foo,\n    bb: _dupName_due_2,\n};\n`;
      t.assert.deepEqual(actual, expected);
    } finally {
      process.chdir(cwd);
    }
  });
  it("rename and called in return statement", async (t) => {
    const cwd = process.cwd();
    const temp = ts.sys.resolvePath(
      "tests/bundle/duplicate_rename/return_statement",
    );
    process.chdir(temp);
    try {
      const int = await initializer();
      const bund = await bundle(int);
      const actual = bund.points[0]?.sourceCode;
      const expected =
        '//src/foo.ts\nfunction _dupName_due_3() {\n    return "Hello world";\n}\n//src/index.ts\nconst _dupName_due_5 = `Hey I\'am the first one!! ${foo}`;\nexport function _dupName_gg_6() {\n    return _dupName_due_5;\n}\n';
      t.assert.deepEqual(actual, expected);
    } finally {
      process.chdir(cwd);
    }
  });
});
