# Contributing to Susee

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

- CLI behavior (`src/cli/**`)
- Compiler pipeline integration (`src/lib/**`)
- Documentation (`docs/**`)
- Tests (`__tests__/test-suites/**`)

## 4. Run local quality checks

Use the scripts from this repository:

```sh
npm run test
npm run lint
npm run docs:build
```

Optional formatting:

```sh
npm run fmt
```

## 5. Commit and open PR

```sh
# run this command in terminal
npm run commit

> susee@1.5.2 commit
> bash scripts/commit.sh

1) ⭐ feat       3) 🎨 modified   5) 👕 refactor   7) 🚀 release    9) 📝 docs
2) 🐛 bug        4) 🔒 security   6) ⚠️ deprecated  8) ✅ tests
Select a number for commit type: # select number what your change
Enter commit message: # enter your commit message

# commit to your current branch
```

Then open a pull request in:

- <https://github.com/phothinmg/susee>

## Related pages

- [Contribution Overview](/guide/contribution-overview)
- [Pull Request Checklist](/guide/contribution-pr-checklist)
