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

## npm, production dependencies only

| Package | Advisories |
|---|---|
| `desktop/` | 5 (postcss, nanoid, source-map-js, browserslist: high; baseline-browser-mapping: moderate). All build-time tooling reached through the frontend build, with a fix available via `npm audit fix`. |
| `browser-extension/` | 0 (9 in dev dependencies: 2 critical, 5 high) |
| `polar-webhook/` | 0 (4 high in dev dependencies) |

Run `npm audit` (without `--omit=dev`) for the dev-dependency detail.

## Next step

One follow-up PR: patch-bump `quinn-proto` and `rustls`, run `npm audit fix` in
the three packages, re-run the full test matrix, then make the job blocking.
