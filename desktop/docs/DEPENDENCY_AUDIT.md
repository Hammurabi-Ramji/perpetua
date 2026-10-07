# Dependency audit baseline (2026-10-07)

The `dependency-audit` job in `.github/workflows/perpetua-ci.yml` runs
`npm audit --omit=dev --audit-level=high` for `desktop/`, `browser-extension/`
and `polar-webhook/`, plus `cargo audit` for `desktop/src-tauri`, on every PR
and weekly. It is **report-only** (`continue-on-error: true`) because the
baseline below is not clean. Flip it to blocking once these are resolved.

## Rust (`cargo audit`): 6 advisories

| Advisory | Crate | Locked | Fixed in |
|---|---|---|---|
| RUSTSEC-2026-0194 (quadratic duplicate-attribute check) | quick-xml | 0.37.5 and 0.39.4 | >= 0.41.0 |
| RUSTSEC-2026-0195 (unbounded namespace allocation, DoS) | quick-xml | 0.37.5 and 0.39.4 | >= 0.41.0 |
| RUSTSEC-2026-0185 (remote memory exhaustion) | quinn-proto | 0.11.14 | >= 0.11.15 |
| RUSTSEC-2026-0285 (TLS 1.3 handshake accepted across encryption levels) | rustls | 0.23.40 | >= 0.23.45 |

`quinn-proto` and `rustls` are patch bumps (`cargo update -p quinn-proto -p
rustls`). `quick-xml` is pulled in transitively at two versions and needs the
parent crates to move. Also reported as warnings: unmaintained
`proc-macro-error` and the `unic-*` crates; unsound `anyhow`,
`event-listener`, `glib`.

## npm: production dependencies are clean

`npm audit fix` (non-breaking) was applied to all three packages on
2026-10-07, which cleared every production advisory:

| Package | Production | Dev (was -> now) |
|---|---|---|
| `desktop/` | 0 (was 5) | 41 -> 34 (2 critical, 16 high remain) |
| `browser-extension/` | 0 | 9 -> 3 (2 critical, 1 moderate) |
| `polar-webhook/` | 0 | 4 -> 3 (high) |

The remaining dev-only advisories need `npm audit fix --force` (breaking
major bumps of build and test tooling), so they are left for a deliberate
upgrade. Run `npm audit` (without `--omit=dev`) for the detail.

## Next step

Patch-bump `quinn-proto` and `rustls` and move `quick-xml`'s parents (the 6
Rust advisories), re-run the full test matrix, then make the job blocking. The
job already gates on production npm dependencies only (`--omit=dev`), which are
clean.
