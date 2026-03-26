# What is Susee?

Susee is a TypeScript bundler that primarily uses the TypeScript Compiler API and Node.js API to build itself and its ecosystem. It gathers local dependency trees and emits compiled artifacts.

Unlike general-purpose bundlers that target browser environments or bundle `node_modules`, `susee` focuses on library authorship: it collates local TypeScript files, merges them into cohesive bundles, compiles them through the TypeScript compiler, and generates properly formatted outputs for consumption as npm packages.
