---
layout: page
---

<!-- markdownlint-disable MD041 -->

```js
async function copyText(text) {
  if ($.navigator.clipboard && $.navigator.clipboard.writeText) {
    try {
      await $.navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return fallbackCopy(text);
    }
  }
  return fallbackCopy(text);
}
```

---

```ts
export type BuildEntryPoint = {
  entry: string;
  exportPath: "." | `./${string}`;
  format: OutputFormat;
  tsconfigFilePath: string | undefined;
  rename: boolean;
  plugins: (SuseePlugin | SuseePluginFunction)[];
  outputDirectoryPath: string;
  warning: boolean;
};
export type BuildOptions = {
  buildEntryPoints: BuildEntryPoint[];
  updatePackage: boolean;
  outDir: string;
};

async function finalSuseeConfig(): Promise<BuildOptions | undefined> {
  const configPath = getConfigPath();
  if (configPath) {
    const _default: { default: SuSeeConfig } = await import(
      configPath as string
    );
    const config = _default.default;
    return generateBuildOptions(config);
  }
}
```
