# tsconfig.json and Custom tsconfig Path Integration

This page explains how Susee uses TypeScript compiler settings and how to provide a custom `tsconfig` path for different build workflows.

## Why this matters

Your `tsconfig.json` controls important compile behavior, such as:

- `target`
- `module`
- declaration output behavior
- source maps

In Susee, these options are applied to build output generation for each entry point. When needed, you can override the default `tsconfig` location per entry or per CLI command.

## Resolution priority

Susee resolves TypeScript options using this order:

1. A custom path (`entryPoints[].tsconfigFilePath` in config mode, or `--tsconfig` in CLI build mode)
2. Root `tsconfig.json`
3. Internal default compiler options

This gives you predictable behavior while still allowing advanced setups.

## Default setup with root tsconfig.json

If you do not pass a custom path, Susee tries to use your root `tsconfig.json`.

Example:

```jsonc
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

## Config-mode integration (`susee.config.ts`)

Use `tsconfigFilePath` when one entry point needs compiler settings that differ from the rest of the package.

```ts
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
      tsconfigFilePath: "tsconfig.build.json",
    },
    {
      entry: "src/cli.ts",
      exportPath: "./cli",
      format: ["esm"],
      tsconfigFilePath: "configs/tsconfig.cli.json",
    },
  ],
  outDir: "dist",
};

export default config;
```

## CLI-mode integration (`susee build`)

For direct CLI builds, pass a custom path with `--tsconfig`.

```sh
susee build src/index.ts --format esm --tsconfig ./configs/tsconfig.build.json
```

This is useful for one-off builds in CI or local experiments without changing `susee.config.ts`.

## Recommended pattern: base + build tsconfig

For medium and large packages, keep a shared base file and extend it in build-specific files.

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

Then reference `tsconfig.build.json` from either:

- `entryPoints[].tsconfigFilePath` in `susee.config.ts`
- `--tsconfig` in `susee build`

## Path tips

- Use project-relative paths consistently.
- Keep custom tsconfig files inside the package (for example, `configs/`).
- In monorepos, prefer package-local tsconfig files to avoid accidental cross-package compiler settings.

## Troubleshooting

If output does not match your expected compiler behavior:

1. Verify the custom path is correct and file exists.
2. Check whether build is running in config mode or direct CLI mode.
3. Confirm the intended file is passed via `tsconfigFilePath` or `--tsconfig`.
4. Recheck your `extends` chain and `include`/`exclude` entries.

## Related pages

- [Configuration File Structure](/guide/config-file-structure)
- [Entry Points](/guide/entry-points)
- [Quick Start](/guide/quick-start)
