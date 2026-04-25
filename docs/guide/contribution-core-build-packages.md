# Contributing to Core Build Packages

This page is for contributions to core `@suseejs/*` build packages in the monorepo:

- <https://github.com/phothinmg/suseejs>

## Target packages

Core build scope packages:

- `@suseejs/bundler`
- `@suseejs/compiler`
- `@suseejs/graph`
- `@suseejs/files`
- `@suseejs/tsoptions`

## 1. Clone monorepo and install

Use npm for consistency with lockfile and npm-based scripts in the monorepo.

```sh
git clone https://github.com/phothinmg/suseejs.git
cd suseejs
npm install
```

If the repository has a hooks installation script, run:

```sh
npm run hooks:install
```

## 2. Pick package scope first

Before coding, choose exactly where the fix belongs:

- API surface or transforms in bundling: `packages/bundler`
- compiler behavior: `packages/compiler`
- dependency graph logic: `packages/graph`
- filesystem/output handling: `packages/files`
- TypeScript options resolution: `packages/tsoptions`

## 3. Implement and test in-package

Recommended flow:

1. Make changes in one package first.
2. Run that package tests/build locally.
3. Validate dependent packages if your change affects shared contracts.

## 4. Keep downstream compatibility in mind

The `susee` package consumes these core packages, so for behavior changes:

- document the change in package README/changelog if needed
- verify `susee` integration behavior still matches expectations
- avoid silent breaking changes

## 5. Commit and open PR

```sh
# run this command in terminal
npm run commit
```

```sh
1) ⭐ feat          3) 🎨 modified      5) 👕 refactor      7) 📦 add(package)  9) ✅ tests
2) 🐛 bug           4) 🔒 security      6) ⚠️ deprecated     8) 🚀 release
Select a number for commit type: # select number what your change
Enter commit message: # enter your commit message

# that will commit to your current branch
```

Then open a pull request in:

- <https://github.com/phothinmg/suseejs>

## Related pages

- [Contribution Overview](/guide/contribution-overview)
- [Core Build Packages](/guide/ecosystem-core-build-packages)
- [Pull Request Checklist](/guide/contribution-pr-checklist)
