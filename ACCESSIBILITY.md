# Accessibility

## Commitment

Susee aims to make its command-line interface, programmatic API, and project
documentation usable by as many people as possible, including people who use
assistive technologies.

## Scope

This statement applies to:

- the `susee` command-line interface;
- the public TypeScript API distributed by the npm package; and
- documentation maintained in this repository.

Susee is a developer tool and does not provide a graphical user interface.
Its accessibility in a particular environment also depends on the terminal,
operating system, editor, browser, and assistive technology chosen by the
user.

## Current Practices

We work to:

- keep CLI commands available through documented text-based arguments;
- provide descriptive command help through `susee --help`;
- report build and configuration errors as text that can be copied and
  inspected;
- maintain documentation in Markdown with headings, code blocks, and
  descriptive links; and
- avoid relying on color alone to communicate CLI status or errors.

## Known Limitations

We have not completed a formal accessibility conformance audit of the CLI,
documentation site, or all supported terminal and assistive-technology
combinations. Generated output and diagnostics produced by third-party
dependencies may not always meet the practices described above.

## Reporting an Accessibility Issue

Please report accessibility barriers by opening an issue at
<https://github.com/phothinmg/susee/issues>. Include, when possible:

- the Susee version;
- your operating system, terminal or browser, and assistive technology;
- the command, API, or documentation page involved;
- steps to reproduce the barrier; and
- the expected and actual result.

For security-sensitive reports, follow the private reporting process in
[SECURITY.md](./SECURITY.md) instead of opening a public issue.

We will review reports in good faith and prioritize fixes based on impact,
reproducibility, and available maintenance capacity.
