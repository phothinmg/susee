---
layout: docs
docs: reference
title: DNS Targets
---

<!-- markdownlint-disable MD025 -->

Only the following CNAME targets are accepted for subdomain requests.

## GitHub Pages

Use your GitHub Pages user domain:

```text
<username>.github.io
```

## Vercel managed CNAME

Use the default Vercel DNS target:

```text
cname.vercel-dns.com
```

## Vercel project CNAME

Use the project-specific Vercel target when required:

```text
<code>.vercel-dns-<number>.com
```

## Notes

1. Point your request to one supported target only.
2. Keep the target under your control before opening a pull request.
3. Use the Guide pages for the submission workflow.
