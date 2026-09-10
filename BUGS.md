# Bug Information for `susee` since v2.3.0

## Overview

This page shows the status of the current bugs in `susee`.

## Bugs

### 1. Strips blank lines from template literals

- **Info**: The core bundler (`@suseejs/susee_bundler`) strips blank lines from template literals during the dependency-tree consolidation step. The bundler drops any line where `trim().is_empty()` when handling `CTS`, `CJS`, and merging file contents from the dependency tree.
- **Impact**: Multi-line template literals in projects built with `susee` lose all their blank lines, resulting in poorly formatted output. When a multi-line template literal like:
    ```js
    const txt = `# Header

    ## Section`;
    ```
    is processed, the empty line between # Header and ## Section is filtered out because it appears as a standalone empty line — the filter has no awareness that it's inside a template literal.
- **Workaround**: Until the fix is released, every literal blank line inside a template literal was replaced with a `<!--BLANK-->` placeholder, and a `.replace(/<!--BLANK-->/g, "")` call was chained at the end of the template. The bundler preserves the placeholder lines (since they are not empty), and the `.replace()` restores the blank lines at runtime.
    ```js
    const txt = `# Header
    <!--BLANK-->
    ## Section`.replace(/<!--BLANK-->/g, "");
    ```
- **Current Status**: Already fixed in the core bundler, but still under testing. It will be resolved in the next minor version.



