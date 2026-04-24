# What is susee

Susee is a TypeScript-first bundler specialized for library packages.Unlike general-purpose bundlers that target application deployment, susee focuses on consolidating a package's local TypeScript dependency tree into single source units and compiling them into dual-format artifacts (ESM and CommonJS) with appropriate declaration files.

## Use Cases

Susee is built for package authors who want a simple path from local TypeScript source files to publishable library output. It is a strong fit when your project is a reusable package rather than a deployed application.

### Building npm libraries from TypeScript

Use susee when your package starts with TypeScript source files and you want ready-to-publish output without wiring together a larger application bundler stack.

- Build a library entry such as `src/index.ts` into distributable artifacts.
- Generate JavaScript output alongside declaration files for consumers.
- Keep the build flow focused on package delivery instead of browser app bundling concerns.

### Publishing both ESM and CommonJS

Many packages still need to support both modern ESM consumers and CommonJS-based tooling. Susee is useful when you want both formats produced from the same source entry with minimal configuration.

- Publish dual-format packages for broader runtime compatibility.
- Avoid maintaining separate build scripts for each module target.
- Keep export artifacts aligned from a single source tree.

### Packaging internal dependency trees into clean outputs

Susee is especially useful when your library is composed of several local TypeScript modules and you want them consolidated into package-ready source units.

- Bundle local helpers, utilities, and internal modules behind a public entry point.
- Reduce friction for consumers who should import your package API rather than your internal file layout.
- Produce outputs that reflect the package surface you intend to maintain.

### Managing multi-entry libraries and subpath exports

If your package exposes more than one entry point, susee fits well because it is designed around explicit package entry definitions.

- Build a root export such as `.` and additional subpath exports such as `./cli` or `./utils`.
- Keep entry-point-specific format settings close to the build configuration.
- Structure monolithic source code into a cleaner published package surface.

### Reducing release overhead for package maintainers

Susee helps when the main problem is not raw bundling power but keeping package builds predictable and repeatable.

- Automate package output generation during release workflows.
- Update relevant `package.json` fields from build results when desired.
- Use the CLI for local builds and CI, or use the programmatic API inside custom scripts.

### When susee is the right tool

Susee is a good choice when your project is primarily:

- A reusable npm package
- A TypeScript library that needs declaration files
- A package that should ship ESM, CommonJS, or both
- A codebase where package entry points matter more than app asset pipelines

If you are building a browser application, server-rendered web app, or frontend asset pipeline with code splitting, HTML handling, and dev-server concerns, a general-purpose app bundler is usually a better fit.
