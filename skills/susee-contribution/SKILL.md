---
name: susee-contribution
description: "Contribute to the susee TypeScript bundler repository itself: navigate the src/ architecture (cli, compiler, config, build/bundler, helpers), run local checks with npm run build/lint/fmt, follow the commit-message conventions via scripts/commit.sh, add tests under tests/, keep docs in sync in susee-docs/, and open PRs matching the checklist. Use when modifying the susee codebase, adding CLI flags or config options, or preparing a pull request."
---

# Susee Contribution

This skill covers working **on** the susee codebase itself (https://github.com/phothinmg/susee) — not building packages *with* susee (see `susee-build`).

## When to Use

- Modifying code in the `susee` repository
- Adding CLI flags, config options, or build pipeline behavior
- Adding tests, updating docs, or preparing a pull request
- Deciding whether a change belongs in `susee` or in the `suseejs` monorepo

## Repository Map

| Path | Responsibility |
| ---- | -------------- |
| `src/cli/**` | CLI behavior — argument parsing (`parse_args.ts`), init scaffolding (`init.ts`), lint command (`lint.ts`), help text (`print_help.ts`) |
| `src/compiler/**` | In-memory TypeScript compilation and JSX handling (`suseeCompiler.ts`, `tsoptions.ts`) |
| `src/config/index.ts` | Config types, validation, and normalization (`SuSeeConfig` → `BuildOptions`) |
| `src/build.ts`, `src/bundler.ts` | Build orchestration and bundling |
| `src/helpers/**` | File system operations and minification |
| `src/index.ts` | Public API — exports `build`, `suseeBundle`, `SuSeeConfig`, `CheckOptions` |
| `tests/**` | Tests mirroring the `src/` structure (`cli/`, `compiler/`, `config/`, `helpers/`) |
| `susee-docs/contents/**` | Documentation site (guide + references) |
| `scripts/` | `build.sh` (napi/native build), `commit.sh` (interactive commit helper), `install-hooks.sh` |

## Step 1: Set Up

```sh
git clone https://github.com/phothinmg/susee.git
cd susee
npm install
npm run hooks:install
```

Create a branch:

```sh
git checkout -b feat/my-change
```

Use `npm` as the package manager — it is required for consistency with lock-files and scripts.

## Step 2: Make the Change

Pick the right area for the change:

- CLI flag or help text → `src/cli/parse_args.ts` + `src/cli/print_help.ts`, test in `tests/cli/`
- New config option → `src/config/index.ts` (type + validation + `generateBuildOptions` normalization), test in `tests/config/`
- Compilation / JSX behavior → `src/compiler/**`, test in `tests/compiler/`
- Build orchestration / bundling → `src/build.ts`, `src/bundler.ts`
- File operations / minify → `src/helpers/**`, test in `tests/helpers/`

Keep changes small and focused, add tests whenever behavior changes, and keep docs aligned with code, CLI, and config behavior. Prefer backward-compatible changes unless a breaking change is intentional and documented.

### Scope check: is it susee or suseejs?

Two contribution paths exist:

- `susee` (this repository) — the CLI/build tool
- `suseejs` monorepo (https://github.com/phothinmg/suseejs) — core build packages:
  - `@suseejs/susee_bundler` — oxc-powered bundling engine (Rust)
  - `@suseejs/ts6` — TypeScript compiler fork for type-checking and declaration emit

If the fix belongs in a core package, change it there first, test in-package, then validate dependent packages. Avoid silent breaking changes downstream — document behavior changes.

## Step 3: Run Local Checks

```sh
npm run build     # compile src/ via oxnode build.ts
npm run lint      # oxlint
npm run fmt:check # oxfmt --check
```

Optional cleanup:

```sh
npm run fmt       # oxfmt
npm run lint:fix  # oxlint --fix
npm run test      # oxnode --test tests/**/*.test.ts
```

All three checks (`build`, `lint`, `fmt:check`) must pass before committing.

## Step 4: Commit

Use the commit helper, which enforces the message convention:

```sh
npm run commit
```

`scripts/commit.sh` interactively prompts for a commit **type** from:

| Emoji | Type |
| ----- | ---- |
| ⭐ | feat |
| 🐛 | bug |
| 🎨 | modified |
| 🔒 | security |
| 👕 | refactor |
| ⚠️ | deprecated |
| 🚀 | release |
| ✅ | tests |
| 📝 | docs |

Then it asks for the message and commits as `<emoji type> : <message>`, staging everything (`git add .`) and pushing to `origin/<current-branch>`.

For manual commits, follow the same pattern: `git commit -m "⭐ feat : <message>"`.

## Step 5: Open the PR

Open the pull request at https://github.com/phothinmg/susee (or the `suseejs` repo for core-package changes) and run through the checklist:

**Scope and intent**

- [ ] The PR addresses one clear problem.
- [ ] The title and description clearly explain what changed and why.
- [ ] Out-of-scope changes were avoided.

**Code quality**

- [ ] New code follows existing style and project patterns.
- [ ] Edge cases and error handling were considered.
- [ ] Config/CLI/API changes are consistent across code and docs.

**Checks**

- [ ] `npm run build`, `npm run lint`, `npm run fmt:check` pass.
- [ ] Tests added/updated for behavior changes (`npm run test`).

**Security**

- [ ] Security-related reports went through private disclosure ([SECURITY.md](SECURITY.md)), not a public issue.

## Common Patterns

- **Adding a CLI flag:** extend the options interfaces and `switch (flag)` in `src/cli/parse_args.ts`. Boolean flags must support `--flag`, `--flag=true|false`, and `--flag true|false` — reuse the existing `parseBooleanFlag` pattern. Mirror the flag in the help text (`src/cli/print_help.ts`) and update `susee-docs/contents/references/command-line-interface.md`.
- **Adding a config option:** add the typed field to `EntryPoint` or `SuSeeConfig` in `src/config/index.ts`, apply its default in `generateBuildOptions`, validate in `checkEntries` (or a new validator) using the `logError(info, cause, true)` fail-fast pattern, and document it in the config guide.
- **Tests:** place them in the `tests/` subdirectory mirroring `src/` (e.g. CLI parser tests in `tests/cli/parse_args.test.ts`) and run with `npm run test`.