import { build } from "./src/index.js";

await build({
    entryPoints:[
        {
            entry:"src/index.ts",
            format:["commonjs","esm"],
            exportPath:".",
        },
        {
            entry:"src/cli/index.ts",
            exportPath:"./cli",
        }
    ],
    allowUpdatePackageJson: true
})