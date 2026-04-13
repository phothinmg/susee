import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export function packageJson() {
	const packageContent = fs.readFileSync(
		path.resolve(process.cwd(), "package.json"),
		"utf8",
	);
	const pkg = JSON.parse(packageContent);
	const name = pkg.name ?? "";
	const version = pkg.version ?? "";
	/**
	 * Get package name and version
	 * @returns {string}
	 */
	const pkgNameVersion = (): string => {
		let pkg_nv = "";
		if (name !== "" && version !== "") {
			pkg_nv = `${name}@${version}`;
		} else if (name !== "" && version === "") {
			pkg_nv = `${name}`;
		} else if (name === "" && version !== "") {
			pkg_nv = `the project@${version}`;
		} else {
			pkg_nv = "the project";
		}
		return pkg_nv;
	};
	const dependencies = (): string[] => {
		const deps = Object.keys(pkg.dependencies ?? {});
		const devDeps = Object.keys(pkg.devDependencies ?? {});
		return [...deps, ...devDeps];
	};

	// -----------------------------------------
	return { pkgNameVersion, dependencies };
}
