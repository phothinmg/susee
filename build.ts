import susee from "./src";
import bannerText from "./src/banner-text";
import minify from "./src/minify";
import { wait } from "./src/helpers";

const licenseText = `
/*! *****************************************************************************
Copyright 2025 Pho Thin Maung<phothinmg@disroot.org>

Licensed under the ISC License.
***************************************************************************** */
`.trim();

const mainEntry = "src/index.ts";
const mainOutdir = "dist";

const bannerTextEntry = "src/banner-text/index.ts";
const bannerTextOutdir = "dist/banner-text";

const minifyEntry = "src/minify/index.ts";
const minifyOutdir = "dist/minify";

async function suseeBuild() {
	console.time("Susee Build");
	console.info("Start : Main entry build");
	await susee.build({
		entry: mainEntry,
		outDir: mainOutdir,
		defaultExportName: "susee",
		hooks: [bannerText(licenseText), minify()],
	});
	console.info("End : Main entry build");
	console.info("---------------------");
	await wait(1000);
	console.info("Start : Banner Text entry build");
	await susee.build({
		entry: bannerTextEntry,
		outDir: bannerTextOutdir,
		defaultExportName: "bannerText",
		isMainExport: false,
		hooks: [bannerText(licenseText), minify()],
	});
	console.info("End : Banner Text entry build");
	console.info("---------------------");
	await wait(1000);
	console.info("Start : Minify entry build");
	await susee.build({
		entry: minifyEntry,
		outDir: minifyOutdir,
		defaultExportName: "minify",
		isMainExport: false,
		hooks: [bannerText(licenseText), minify()],
	});
	console.info("End : Minify entry build");
	console.timeEnd("Susee Build");
}

await suseeBuild();
