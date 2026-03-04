# Contributing to susee

Thanks for contributing to **susee**.

## Prerequisites

- Node.js (current active LTS recommended)
- npm

## Local setup

```bash
npm install
```

## Development workflow

1. Make your changes in a focused branch.
2. Keep changes scoped to one purpose (fix, refactor, or feature).
3. Run checks before opening a PR.

## Quality checks

Run these commands before pushing:

```bash
npm test
npm run build
npm run lint
npm run fmt
```

## Project scripts

- `npm test` — run the test suite (`tsx --test`)
- `npm run build` — run bundler build via `build.ts`
- `npm run lint` — run Biome checks on `src`
- `npm run fmt` — format code with Biome

## Commit guidance

- Write clear commit messages in imperative mood.
- Keep commits small and reviewable.
- Avoid mixing unrelated changes in one commit.

## Pull request checklist

- [ ] Tests pass locally (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Lint/format checks are clean
- [ ] Changelog is updated when user-facing behavior changes
- [ ] PR description explains what changed and why

## Reporting bugs and proposing features

When opening an issue, include:

- Current behavior
- Expected behavior
- Steps to reproduce
- Environment details (OS, Node.js version)
- Minimal reproducible example if possible

## Notes

- Keep compatibility with current Node.js-based workflow.
- For large changes, open an issue first to discuss design and scope.
