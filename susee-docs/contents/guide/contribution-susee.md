---
layout: docs
label: guide
title: Contributing to Susee
---

This page covers contribution workflow for this repository: `susee`.

## 1. Clone and install

Use npm for this repository so contributors use the same lockfile and scripts.

```sh
git clone https://github.com/phothinmg/susee.git
cd susee
npm install
npm run hooks:install
```

## 2. Create a working branch

```sh
git checkout -b feat/my-change
```

## 3. Make your change

Common contribution areas:

- Native addon bindings (`src/lib.rs`)
- CLI behavior (`src/core/susee_cli/**`)
- Build pipeline internals (`src/core/susee_bundler/**`, `src/core/susee_compiler/**`, `src/core/susee_tree/**`)
- Documentation (`susee-docs/contents/**`)
- Tests (in-module `#[cfg(test)]` blocks run via `cargo test`)

## 4. Run local quality checks

Use the scripts and commands from this repository:

```sh
npm install
npm run build      # build the native addon (napi-rs)
cargo check
cargo test
cargo fmt
```

For docs work, use the available docs scripts when needed:

```sh
npm run docs:init
npm run docs:dev
```

## 5. Commit and open PR

```sh
# run this command in terminal
npm run commit
```

```sh
1) ⭐ feat       3) 🎨 modified   5) 👕 refactor   7) 🚀 release    9) 📝 docs
2) 🐛 bug        4) 🔒 security   6) ⚠️ deprecated  8) ✅ tests
Select a number for commit type: # select number what your change
Enter commit message: # enter your commit message

# that will commit to your current branch
```

Then open a pull request in:

- <https://github.com/phothinmg/susee>

## Related pages

- [Contribution Overview](/guide/contribution-overview)
- [Pull Request Checklist](/guide/contribution-pr-checklist)
