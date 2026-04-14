<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<div align="center">
<img src="https://susee.phothin.dev/logo/susee.webp" width="160" height="160" alt="susee" />
  <h1>Susee Plugin Terser</h1>
</div>

A Susee plugin that minifies JavaScript code using the Terser library.

## Install

```bash
npm i -D @suseejs/plugin-terser
```

## Use

In your `susee.config.ts`

```ts
import type { SuSeeConfig } from "susee";
import suseeTerser from "@suseejs/plugin-terser";

const terserMinifyOptions = {
  toplevel: true,
};

export default {
  entryPoints: [
    {
      entry: "src/index.ts",
      format: "both",
      exportPath: ".",
    },
  ],
  plugins: [suseeTerser(terserMinifyOptions)],
} as SuSeeConfig;
```

**`terserMinifyOptions`** -> [See detail here](https://terser.org/docs/options/)
