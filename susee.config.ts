import type { SuSeeConfig, plugins, SuseePlugin } from "./src/types.js";
import bannerTextHook from "@suseejs/banner-text";
import utils from "@suseejs/utils";

const licenseText = `
/*! *****************************************************************************
Copyright (c) Pho Thin Mg <phothinmg@disroot.org>

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0
***************************************************************************** */
`.trim();

const banner = (text: string): SuseePlugin => {
  return {
    type: "post-process",
    async: false,
    func: (code, file) => {
      if (file && utils.extname(file) === ".js") {
        code = `${text}\n\n${code}\n`;
      }
      return code;
    },
  };
};

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      output: {
        target: "nodejs",
        exportPath: ".",
        format: "both",
        allowUpdatePackageJson: false,
      },
    },
  ],
  plugins: [banner(licenseText)],
};

export default config;
