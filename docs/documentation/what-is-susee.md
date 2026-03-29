# What is Susee?

`susee` is a TypeScript bundler specialized for library authorship rather than application bundling. Unlike general-purpose bundlers that target browser environments or bundle `node_modules` dependencies, `susee` focuses on consolidating a package's local TypeScript dependency tree into compiled artifacts suitable for distribution via `npm`.

The primary workflow involves:

1. Resolving local TypeScript file dependencies from specified entry points
2. Merging these files into cohesive bundles
3. Compiling through the TypeScript compiler
4. Generating dual-format outputs (ESM and CommonJS) with appropriate file extensions
5. Optionally updating `package.json` with proper export configurations
