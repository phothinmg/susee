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

- CLI behavior (`src/cli/**`) — entry point dispatch, argument parsing, init scaffolding, help text
- Build pipeline (`src/build.ts`, `src/bundler.ts`) — build orchestration and bundling
- Compiler (`src/compiler/**`) — TypeScript compilation, compiler option resolution, JSX detection
- Config (`src/config/**`) — config loading, validation, build option generation
- Helpers (`src/helpers/**`) — file system operations, minification
- Documentation (`susee-docs/contents/**`)

## 4. Run local quality checks

Use the scripts and commands from this repository:

```sh
npm install
npm run build      # build via oxnode build.ts
npm run lint       # oxlint
npm run lint:fix   # oxlint --fix
npm run fmt        # oxfmt
npm run fmt:check  # oxfmt --check
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
