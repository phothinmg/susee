import assert from "node:assert";
import { describe, it } from "node:test";
import { mergeImportsStatement } from "../../src/lib/utils/mergeImports.js";

describe("Merge Imports Statement Tests", () => {
	it("merges named imports and keeps type-only names when no regular equivalent exists", () => {
		const imports = [
			'import { A, C } from "pkg-a";',
			'import type { A, B } from "pkg-a";',
			'import type { D } from "pkg-b";',
		];

		const result = mergeImportsStatement(imports);

		assert.deepStrictEqual(result, [
			'import type { D } from "pkg-b";',
			'import { A, B, C } from "pkg-a";',
		]);
	});

	it("deduplicates default imports against type default imports for the same module", () => {
		const imports = [
			'import Foo from "pkg-a";',
			'import type Foo from "pkg-a";',
			'import type Bar from "pkg-b";',
		];

		const result = mergeImportsStatement(imports);

		assert.deepStrictEqual(result, [
			'import Foo from "pkg-a";',
			'import type Bar from "pkg-b";',
		]);
	});

	it("keeps namespace imports and returns sorted merged output", () => {
		const imports = [
			'import * as fs from "node:fs";',
			'import type { Stats } from "node:fs";',
			'import { join } from "node:path";',
			'import type { PathLike } from "node:path";',
			'import "side-effect-only";',
		];

		const result = mergeImportsStatement(imports);

		assert.deepStrictEqual(result, [
			'import * as fs from "node:fs";',
			'import type { Stats } from "node:fs";',
			'import { PathLike, join } from "node:path";',
		]);
	});
});
