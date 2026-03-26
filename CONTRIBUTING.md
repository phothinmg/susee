# Contributing to susee

Thanks for contributing to **susee**.

## Prerequisites

- Node.js (current active LTS recommended)
- npm

## Local setup

```bash
git clone https://github.com/phothinmg/susee.git
cd susee
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
npm
```

## Architecture

The architecture follows a three-phase pipeline: [initialization][int], **bundling**, and **compilation**. Each phase has clear boundaries and responsibilities.

<!-- markdownlint-disable MD053 -->

[int]: project-docs/initialization.md
