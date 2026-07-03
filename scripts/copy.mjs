import fs from "node:fs/promises";
async function copyDirectory(src, dest) {
	try {
		await fs.cp(src, dest, { recursive: true });
		console.log("Directory copied successfully!");
	} catch (err) {
		console.error("Error copying directory:", err);
	}
}

copyDirectory("node-tools/lib", "docs/node-js");
