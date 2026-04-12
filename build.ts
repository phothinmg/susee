import { exec } from "node:child_process";
import resolves from "@phothinmaung/resolves";
import { build } from "esbuild";
import { susee } from "./src/index.js";

async function esBuild() {
  await build({
    entryPoints: ["./cli/index.js"],
    outdir: "bin",
    platform: "node",
    bundle: true,
    external: ["esbuild", "typescript"],
    format: "esm",
    legalComments: "eof",
    minify: true,
    loader: {
      ".js": "js",
      ".mjs": "js",
    },
  });
}
const chmod = "chmod +x bin/index.js";

async function suseeBuild() {
  const jobs = [susee, esBuild];
  for (const job of jobs) {
    await job();
  }
}

await suseeBuild();
exec(chmod);
