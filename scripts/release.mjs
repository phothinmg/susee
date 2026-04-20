import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const CHECK_ONLY = process.argv.includes("--check-only");

function fail(message) {
	console.error(`\n[release:ws] ${message}`);
	process.exit(1);
}

function info(message) {
	console.log(`[release:ws] ${message}`);
}

function run(command, options = {}) {
	execSync(command, { stdio: "inherit", ...options });
}

function capture(command) {
	return execSync(command, { encoding: "utf8" }).trim();
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function validateWorkspaceVersions(rootPackageJson) {
	const workspacePaths = Array.isArray(rootPackageJson.workspaces)
		? rootPackageJson.workspaces
		: [];

	if (workspacePaths.length === 0) {
		fail("No workspaces found in root package.json.");
	}

	const packages = workspacePaths.map((workspacePath) => {
		const manifestPath = join(workspacePath, "package.json");
		const manifest = readJson(manifestPath);

		if (!manifest.name) {
			fail(`Missing package name in ${manifestPath}.`);
		}

		if (!manifest.version) {
			fail(`Missing package version in ${manifestPath}.`);
		}

		return {
			path: workspacePath,
			manifestPath,
			name: manifest.name,
			version: manifest.version,
			manifest,
		};
	});

	const workspaceByName = new Map(packages.map((pkg) => [pkg.name, pkg]));

	for (const pkg of packages) {
		const dependencySets = [
			pkg.manifest.dependencies || {},
			pkg.manifest.peerDependencies || {},
			pkg.manifest.optionalDependencies || {},
		];

		for (const deps of dependencySets) {
			for (const [depName, depRange] of Object.entries(deps)) {
				if (
					typeof depRange !== "string" ||
					!depRange.startsWith("workspace:")
				) {
					const internalDep = workspaceByName.get(depName);
					if (!internalDep) {
						continue;
					}

					if (depRange.length === 0) {
						fail(
							`Package ${pkg.name} has an empty version range for ${depName}.`,
						);
					}

					continue;
				}
			}
		}
	}

	info(
		`Validated ${packages.length} workspace package version(s) and internal dependency references.`,
	);
}

function normalizeInternalDependencyRanges(rootPackageJson) {
	const workspacePaths = Array.isArray(rootPackageJson.workspaces)
		? rootPackageJson.workspaces
		: [];

	const packages = workspacePaths.map((workspacePath) => {
		const manifestPath = join(workspacePath, "package.json");
		const manifest = readJson(manifestPath);
		return { workspacePath, manifestPath, manifest };
	});

	const versionByName = new Map(
		packages
			.filter((pkg) => pkg.manifest?.name && pkg.manifest?.version)
			.map((pkg) => [pkg.manifest.name, pkg.manifest.version]),
	);

	let changedCount = 0;

	for (const pkg of packages) {
		let changed = false;
		const depFields = [
			"dependencies",
			"peerDependencies",
			"optionalDependencies",
		];

		for (const field of depFields) {
			const deps = pkg.manifest[field];
			if (!deps || typeof deps !== "object") {
				continue;
			}

			for (const depName of Object.keys(deps)) {
				const internalVersion = versionByName.get(depName);
				if (!internalVersion) {
					continue;
				}

				const wanted = `^${internalVersion}`;
				if (deps[depName] !== wanted) {
					deps[depName] = wanted;
					changed = true;
				}
			}
		}

		if (changed) {
			writeJson(pkg.manifestPath, pkg.manifest);
			changedCount += 1;
			info(`Normalized internal dependency ranges in ${pkg.manifestPath}.`);
		}
	}

	if (changedCount === 0) {
		info("Internal dependency ranges already normalized for publish.");
	}
}

function ensureCleanGitTree() {
	const status = capture("git status --porcelain");
	if (status) {
		fail("Working tree is not clean. Commit or stash changes before release.");
	}

	info("Git working tree is clean.");
}

function ensureNpmAuth() {
	try {
		const user = capture("npm whoami");
		if (!user) {
			fail("Could not determine npm user.");
		}

		info(`Authenticated to npm as ${user}.`);
	} catch {
		fail("npm authentication check failed. Run npm login and try again.");
	}
}

function main() {
	const rootPackageJson = readJson("package.json");

	ensureCleanGitTree();
	ensureNpmAuth();
	validateWorkspaceVersions(rootPackageJson);
	normalizeInternalDependencyRanges(rootPackageJson);

	info("Building workspaces...");
	run("npm run build");

	if (CHECK_ONLY) {
		info("Check-only mode enabled. Skipping publish.");
		return;
	}

	info("Publishing workspaces...");
	run("npm run publish:ws");

	info("Workspace release completed.");
}

main();
