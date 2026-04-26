# Security Policy

This project is an npm package and CLI (`susee`) for TypeScript-first library builds.
This policy explains how to report vulnerabilities and what versions are currently supported.

## Supported Versions

We follow SemVer and provide security fixes for actively maintained versions only.

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| < 1.0   | No        |

If a fix is not practical for an older release line, we may provide guidance to upgrade to a supported version.

## Reporting a Vulnerability

Please do not open public GitHub issues for security vulnerabilities.

Use one of the following private channels:

1. GitHub Security Advisory (preferred):
   - Open a private report at: <https://github.com/phothinmg/susee/security/advisories/new>
2. Email:
   - `phothinmg@disroot.org`

## What to Include in Your Report

To help us reproduce and validate quickly, include:

- A clear description of the vulnerability and impact.
- Affected version(s) of `susee`.
- Environment details (OS, Node.js version).
- Reproduction steps with minimal sample files.
- Example `susee` command or `susee.config.ts` used.
- Any proof-of-concept code, logs, or stack traces.
- Whether the issue is public anywhere else.

## Response Timeline

Targets (best effort):

- Initial acknowledgment: within 72 hours.
- Triage decision: within 7 days.
- Fix or mitigation plan: as soon as practical based on severity and release risk.

## Disclosure Process

After confirmation:

1. We assess severity and affected versions.
2. We prepare a patch or mitigation.
3. We release a fixed version.
4. We publish advisory details and credit the reporter (if requested).

## Security Scope for This Repository

Relevant areas include:

- CLI argument parsing and command handling (`src/cli/**`).
- Configuration loading/resolution (`src/lib/suseeConfig.ts`).
- Build/compiler orchestration (`src/lib/compiler.ts`).
- Dependency risk in runtime packages (`@suseejs/*`).

## Dependency and Supply Chain Practices

- Dependencies are managed with `npm` and `package-lock.json`.
- CI and CodeQL signals should be reviewed before merge.
- Security fixes should include tests when behavior changes.

## Safe Harbor

We appreciate good-faith security research and responsible disclosure.
As long as you avoid privacy violations, data destruction, and service disruption, we will treat your report as authorized research.
