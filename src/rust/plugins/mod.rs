//! Plugin / hook system.
//!
//! Ported from the `@suseejs/type` plugin definitions (`SuseePlugin`,
//! `PreProcessPlugin`, `PostProcessPlugin`, `DependencyPlugin`) and the
//! dispatch sites in `src/nodejs/bundler/index.ts` and
//! `src/nodejs/compiler/index.ts`.
//!
//! ## Design
//!
//! The TS plugin system is structurally typed: a plugin is an object with
//! `type`, `async`, `func`, and optional `name`. The Rust port uses a
//! **trait-based** design instead:
//!
//! - [`Plugin`] is the trait every plugin implements. It has three hook
//!   methods, one per pipeline stage. Each defaults to a no-op (returns the
//!   input unchanged), so a plugin only overrides the stage(s) it cares
//!   about. This replaces the TS `type` discriminator + downcast pattern
//!   with plain virtual dispatch.
//! - [`PluginType`] tags which stage(s) a plugin participates in, so the
//!   dispatcher can short-circuit and profiling can label phases. This
//!   mirrors the TS `type: "pre-process" | "post-process" | "dependency"`.
//! - [`PluginContext`] carries the metadata a hook needs (entry path,
//!   output format, compiler options reference, file name). This replaces
//!   the positional `func(code, file?)` / `func(depsFiles, compilerOptions)`
//!   signatures with a single extensible context object.
//!
//! ## The three hook stages (mirroring the TS pipeline)
//!
//! 1. **`dependency`** ([`Plugin::on_dependencies`]) — runs in the bundler
//!    right after JSON-module resolution and before the CommonJS check.
//!    Receives the `Vec<DepsFile>` and may rewrite it (rename, inject,
//!    drop). This is the "tree(ast) plugin" hook from the project notes —
//!    future plugins that manage npm modules / node builtins live here.
//! 2. **`pre-process`** ([`Plugin::on_pre_process`]) — runs in the bundler
//!    after the final content merge and before returning. Receives the
//!    bundled source string.
//! 3. **`post-process`** ([`Plugin::on_post_process`]) — runs in the
//!    compiler after emit, before writing files. Receives the compiled JS
//!    code.
//!
//! ## Async
//!
//! The TS plugins have an `async: boolean` field. The Rust port is
//! synchronous (the bundler and compiler are already sync), so there is no
//! `async` flag — hooks are plain `fn`s. A future N-API layer can expose
//! async wrappers if needed.
//!
//! ## Built-in plugins
//! - [`MinifyPlugin`] — a `post-process` plugin that strips comments and
//!   collapses whitespace (a minimal stand-in for a real minifier).
//! - [`TreePlugin`] — a `dependency` plugin skeleton demonstrating the
//!   tree/AST hook from the project notes.
//!
//! ## Registering plugins
//!
//! Plugins are stored as `Vec<Box<dyn Plugin>>` on [`BuildEntryPoint`] and
//! [`CliBuildOptions`], and dispatched by the bundler and compiler at the
//! appropriate stages. See [`dispatch`] for the shared dispatcher.

pub mod builtins;
pub mod context;
pub mod dispatcher;
pub mod plugin;
pub mod types;

pub use builtins::{MinifyPlugin, TreePlugin};
pub use context::{DependencyPayload, PluginContext, PostProcessPayload, PreProcessPayload};
pub use dispatcher::{dispatch_dependencies, dispatch_post_process, dispatch_pre_process};
pub use plugin::{Plugin, PluginError};
pub use types::PluginType;
