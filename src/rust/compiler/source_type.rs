use oxc::span::SourceType;

/// Detect the [`SourceType`] of a source string by attempting to parse it
/// in multiple modes, starting from the **most restrictive** language and
/// escalating to more permissive ones only if parsing fails.
///
/// The candidate source types are tried in this order:
///
/// | order | candidate    | language   | module kind | JSX |
/// |-------|--------------|------------|------------|-----|
/// | 1     | `mjs`        | JavaScript | module     | ❌  |
/// | 2     | `cjs`        | JavaScript | CommonJS   | ❌  |
/// | 3     | `mjs + jsx`  | JavaScript | module     | ✅  |
/// | 4     | `cjs + jsx`  | JavaScript | CommonJS   | ✅  |
/// | 5     | `ts`         | TypeScript | unambiguous| ❌  |
/// | 6     | `tsx`        | TypeScript | unambiguous| ✅  |
///
/// Detection logic:
///
/// 1. Parse the source with each candidate in order.
/// 2. Return the **first** candidate that produces zero parse errors.
/// 3. If no candidate parses cleanly, return `Err` with the diagnostics of
///    the candidate that produced the fewest errors.
///
/// **Why most-restrictive-first?** TypeScript is a superset of JavaScript, so
/// any valid JS also parses as TS. Similarly, JSX mode accepts everything
/// standard mode does. By trying the smallest language first, we avoid
/// false-positive detection of TS/JSX on plain JavaScript.
///
/// **Module kind:** `mjs` (ESM) is tried before `cjs` because both accept
/// `import`/`export`, but only `cjs` allows top-level `return`. So code with
/// `return` at the top level fails `mjs` and falls through to `cjs`.
///
/// # Examples
///
/// ```
/// # use susee::detect_source_type;
/// use oxc::span::SourceType;
///
/// // Plain JavaScript → mjs (not ts!)
/// assert_eq!(
///     detect_source_type("const x = 1;").unwrap(),
///     SourceType::mjs()
/// );
///
/// // TypeScript with types → ts
/// assert_eq!(
///     detect_source_type("const x: number = 1;").unwrap(),
///     SourceType::ts()
/// );
///
/// // JSX (JavaScript + JSX, no TS syntax) → mjs + jsx
/// assert_eq!(
///     detect_source_type("const x = <Foo/>;").unwrap(),
///     SourceType::mjs().with_jsx(true)
/// );
///
/// // TSX (TypeScript + JSX) → tsx
/// assert_eq!(
///     detect_source_type("const x: number = <Foo/>;").unwrap(),
///     SourceType::tsx()
/// );
///
/// // Top-level return → cjs
/// assert_eq!(
///     detect_source_type("return 1;").unwrap(),
///     SourceType::cjs()
/// );
/// ```
pub fn detect_source_type(source_code: &str) -> Result<SourceType, String> {
    /// Candidate source types ordered from most restrictive to most permissive.
    ///
    /// JavaScript is tried before TypeScript (TS is a superset of JS, so valid
    /// JS also parses as TS — we want the *smallest* language that works).
    /// Standard variant is tried before JSX (JSX accepts everything standard
    /// does). `mjs` is tried before `cjs` (both accept import/export, but only
    /// `cjs` allows top-level `return`).
    const CANDIDATES: [SourceType; 6] = [
        SourceType::mjs(),                // JavaScript + Module (ESM)
        SourceType::cjs(),                // JavaScript + CommonJS
        SourceType::mjs().with_jsx(true), // JavaScript + Module + JSX
        SourceType::cjs().with_jsx(true), // JavaScript + CommonJS + JSX
        SourceType::ts(),                 // TypeScript
        SourceType::tsx(),                // TypeScript + JSX
    ];

    /// Parse `src` with the given `SourceType` and return the list of
    /// diagnostic messages (empty if parsing succeeded).
    fn collect_errors(src: &str, st: SourceType) -> Vec<String> {
        let allocator = oxc::allocator::Allocator::default();
        let parsed = oxc::parser::Parser::new(&allocator, src, st).parse();
        if parsed.panicked {
            vec!["parser panicked".to_string()]
        } else {
            parsed
                .diagnostics
                .iter()
                .map(|d| format!("{d}"))
                .collect::<Vec<_>>()
        }
    }

    // Collect errors for each candidate.
    let results: [(SourceType, Vec<String>); 6] = CANDIDATES.map(|st| {
        let errors = collect_errors(source_code, st);
        (st, errors)
    });

    // Find the first candidate (most restrictive) with zero errors.
    for (st, errors) in &results {
        if errors.is_empty() {
            return Ok(*st);
        }
    }

    // No clean parse — return the errors of the candidate with the fewest
    // diagnostics (ties broken by order: most restrictive wins).
    let (best_st, best_errors) = results
        .iter()
        .min_by_key(|(_, errors)| errors.len())
        .expect("CANDIDATES is non-empty");

    Err(format!(
        "Failed to parse source code as any known variant.\n\
         Best match was {best_st:?} with {} error(s):\n{}",
        best_errors.len(),
        best_errors.join("\n"),
    ))
}
