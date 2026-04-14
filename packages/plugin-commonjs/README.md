# plugin-commonjs

A Susee plugin that transforms commonjs exports and imports into ES modules.

## Install

```bash
npm i -D @suseejs/plugin-commonjs
```

## Use

In your `susee.config.ts`

```ts
import type { SuSeeConfig } from "susee";
import suseeCommonJS from "@suseejs/plugin-commonjs";

export default {
  entryPoints: [
    {
      entry: "src/index.ts",
      format: "both",
      exportPath: ".",
    },
  ],
  plugins: [suseeCommonJS()],
} as SuSeeConfig;
```
