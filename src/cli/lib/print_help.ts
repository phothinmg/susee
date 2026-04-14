export function printHelp() {
  console.log(`Susee CLI.

Usage:
  susee                                 Build using susee.config.{ts,js,mjs}
  susee init                            Generate susee.config.{ts,js,mjs}
  susee --help                          Show this message
  susee build <entry> [options]         Build from a single entry file

Options:
  --entry <path>                       Entry file (optional if provided as positional <entry>)
  --outdir <path>                      Output directory
  --format <cjs|commonjs|esm>          Output module format
  --tsconfig <path>                    Custom tsconfig path
  --rename[=true|false]                Enable/disable renaming
  --allow-update[=true|false]          Enable/disable dependency update
  --minify[=true|false]                Enable/disable minification

Examples:
  susee build src/index.ts --outdir dist
  susee build src/index.ts --format commonjs
  susee build --entry src/index.ts --format esm --minify
  
`);
}
