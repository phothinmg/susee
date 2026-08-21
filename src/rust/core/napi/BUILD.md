# Build notes for the N-API JS bridge

The native addon (`src/rust/napi/`) is gated behind the `napi` cargo feature
so the CLI binary (`susee_main`) doesn't pull in Node's N-API headers.

## Building the native addon

```sh
# Build the .node cdylib (release):
cargo build --release --features napi

# The output is at target/release/libsusee.node (Linux) or the platform
# equivalent. Copy it to src/nodejs/native/ or let the JS loader find it
# in target/ during development.
```

## Building the CLI binary (no napi)

```sh
cargo build --bins
# → target/debug/susee_main
```

Do **not** combine `--bins` with `--features napi` — the binary doesn't link
against Node's N-API symbols, so the cdylib's napi deps would be unresolved.

## Testing

```sh
# Lib tests (works with or without --features napi):
cargo test --lib
cargo test --lib --features napi   # also runs the napi module tests

# Integration tests (bundler/compiler/plugins — no napi needed):
cargo test --test export_removal --test plugins
```

## Cross-platform prebuilts

For publishing, use `@napi-rs/cli` to build per-platform `.node` files and
generate the loader (`src/nodejs/native/index.js` expects it at
`../napi/index.js`). The existing `target/` directory already tracks
aarch64/x86_64 for linux/musl/apple/windows, matching the napi-rs matrix.