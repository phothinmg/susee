---
layout: page
title: MMSD CLI
---

<!-- markdownlint-disable MD001 -->

## Features

1. Check whether your requested subdomain is available.
2. Generate a registration JSON file.

## CLI Usage

```text
MMSD CLI.

Usage:

    mmsd <sub_domain>            Check subdomain availability and generate subdomains/<sub_domain>.json

```

### CLI Examples

- **Argument Errors:**

```text
npx mmsd
[Error]
One CLI argument is required. Example: npx mmsd <sub_domain>.
```

```text
npx mmsd foo bar biz
[Error]
Only one CLI argument is allowed. Example: npx mmsd <sub_domain>.
```

- **Subdomain Not Available:**

```text
npx mmsd example
[Subdomain Not Available]
Subdomain "example" is registered by another user. Please try another name.
```

```text
npx mmsd doc
[Subdomain Not Available]
Subdomain "doc" is reserved by MMDEVS.ORG. Please try another name.
```

- **Available Subdomain:**

```text
npx mmsd phowa
[Success]
Registration JSON file "subdomains/phowa.json" was created.
```

- **Existing File:**

```text
npx mmsd phowa
[Error]
File "subdomains/phowa.json" already exists.
```

- **Network Error:**

```text
npx mmsd example
[Network Error]
fetch failed. Please try again later.
```
