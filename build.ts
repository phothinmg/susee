import susee from "./src";
import bannerTextHook from "@suseejs/banner-text";

const licenseText = `
/*! *****************************************************************************
Copyright (c) Pho Thin Mg <phothinmg@disroot.org>

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0
***************************************************************************** */
`.trim();

const mainEntry = "src/index.ts";

async function suseeBuild() {
	console.time("Susee Build");
	console.info("Start : Main entry build");
	await susee.build({
		entry: mainEntry,
		exportPath: ".",
		hooks: [bannerTextHook(licenseText)],
	});
	console.info("End : Main entry build");
	console.info("---------------------");
	console.info("Start : Minify entry build");
	await susee.build({
		entry: "src/hooks/minify/index.ts",
		exportPath: "./minify",
		hooks: [bannerTextHook(licenseText)],
	});
	console.info("End : Minify entry build");
	console.info("---------------------");
	console.info("Start : Banner Text entry build");
	await susee.build({
		entry: "src/hooks/banner-text/index.ts",
		exportPath: "./banner-text",
		hooks: [bannerTextHook(licenseText)],
	});
	console.info("End : Banner Text entry build");
	console.timeEnd("Susee Build");
}

await suseeBuild();
