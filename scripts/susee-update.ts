import { executeCommand } from "./execute-command.js";
import pkg from "../package.json" with { type: "json" };

const dev_keys = Object.keys(pkg.devDependencies);
const dep_keys = Object.keys(pkg.dependencies);
const module_keys = [...dep_keys, ...dev_keys];

async function suseePackageUpdates() {
	const updateModulesCommand = module_keys
		.map((key) => `${key}@latest`)
		.join(" ");
	const updateCommand = `npm i ${updateModulesCommand}`;
	await executeCommand(updateCommand);
}

suseePackageUpdates();
