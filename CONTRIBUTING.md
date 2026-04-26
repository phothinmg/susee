<!-- markdownlint-disable MD024 -->

# Contributing Guide

This guide is based on <https://suseejs.vercel.app/guide/contribution-overview.html>:

- Contribution Overview
- Contributing to Susee
- Contributing to Core Build Packages
- Pull Request Checklist

## Contribution Overview

You can contribute to two places in the ecosystem:

- `susee` (this repository): <https://github.com/phothinmg/susee>
- Core build scope packages in `suseejs` monorepo: <https://github.com/phothinmg/suseejs>

Choose one path first so your change stays focused.

### Shared principles

- Keep changes small and focused.
- Add tests when behavior changes.
- Keep docs aligned with code, CLI, and config behavior.
- Prefer backward-compatible changes unless a breaking change is intentional and documented.
- Use `npm` as package manager for consistency with lock-files and scripts.
- Install hooks after clone when available.

## Contributing to Susee

This path is for changes in this repository (`susee`).

### 1. Clone and install

```sh
git clone https://github.com/phothinmg/susee.git
cd susee
npm install
npm run hooks:install
```

### 2. Create a branch

```sh
git checkout -b feat/my-change
```

### 3. Make your change

Common areas:

- `src/cli/**` for CLI behavior
- `src/lib/**` for compiler/build integration
- `docs/**` for docs updates
- `__tests__/test-suites/**` for tests

### 4. Run local checks

```sh
npm run test
npm run lint
npm run docs:build
```

Optional formatting:

```sh
npm run fmt
```

### 5. Commit and open PR

Use the commit helper:

```sh
npm run commit
```

Open your pull request at: <https://github.com/phothinmg/susee>

## Contributing to Core Build Packages

This path is for changes in the `suseejs` monorepo.

### 1. Clone and install

```sh
git clone https://github.com/phothinmg/suseejs.git
cd suseejs
npm install
npm run hooks:install
```

### 2. Pick package scope first

Core build packages:

- `@suseejs/bundler` (`packages/bundler`)
- `@suseejs/compiler` (`packages/compiler`)
- `@suseejs/graph` (`packages/graph`)
- `@suseejs/files` (`packages/files`)
- `@suseejs/tsoptions` (`packages/tsoptions`)

### 3. Implement and test in-package

Recommended flow:

1. Change one package first.
2. Run tests/build for that package.
3. Validate dependent packages if shared contracts changed.

### 4. Keep downstream compatibility in mind

`Susee` consumes these packages, so behavior changes should:

- be documented when needed
- be verified in integration behavior
- avoid silent breaking changes

### 5. Commit and open PR

```sh
npm run commit
```

Open your pull request at: <https://github.com/phothinmg/suseejs>

## Pull Request Checklist

Use this checklist before opening a PR in either repository.

### Scope and intent

- [ ] The PR addresses one clear problem.
- [ ] The title and description clearly explain what changed and why.
- [ ] Out-of-scope changes were avoided.

### Code quality

- [ ] New code follows existing style and project patterns.
- [ ] Edge cases and error handling were considered.
- [ ] Config/CLI/API changes are consistent across code and docs.

### Testing

- [ ] Existing tests pass.
- [ ] New tests were added for changed behavior.
- [ ] Manual verification was done for affected CLI/build output paths.

### Documentation

- [ ] Relevant documentation was updated.
- [ ] Examples still match current behavior and option names.

### Release impact

- [ ] Breaking changes are clearly called out.
- [ ] Consumer impact is documented (especially for `@suseejs/*`).

### Final sanity check

- [ ] Branch is up to date with base branch.
- [ ] Commit messages are clear.
- [ ] Dependencies were installed with `npm`.
- [ ] Hooks were installed when the repository provides them.
- [ ] PR is ready for review.

## Documentation Sources

These docs pages were used as the source for this file:

- `docs/guide/contribution-overview.md`
- `docs/guide/contribution-susee.md`
- `docs/guide/contribution-core-build-packages.md`
- `docs/guide/contribution-pr-checklist.md`
