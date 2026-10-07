# Dependency audit baseline (2026-10-07)

The `dependency-audit` job in `.github/workflows/perpetua-ci.yml` runs
`npm audit --omit=dev --audit-level=high` for `desktop/`, `browser-extension/`
and `polar-webhook/`, plus `cargo audit` for `desktop/src-tauri`, on every PR
and weekly. It **blocks**: the baseline is clean as of 2026-10-07. `cargo
audit` fails only on vulnerabilities; the unmaintained/unsound warnings below
are informational.

## Rust (`cargo audit`): 0 vulnerabilities

On 2026-10-07 the lockfile had 6 advisories: `quick-xml` 0.37.5 and 0.39.4
(RUSTSEC-2026-0194, -0195), `quinn-proto` 0.11.14 (RUSTSEC-2026-0185) and
`rustls` 0.23.40 (RUSTSEC-2026-0285). `cargo update -p quinn-proto -p rustls -p
tauri-winrt-notification -p plist -p notify-rust` cleared all of them
(semver-compatible; `Cargo.lock` only).

Still reported as warnings (not failures): unmaintained `proc-macro-error` and
the `unic-*` crates (transitive, via Tauri's build tooling); unsound `anyhow`,
`event-listener`, `glib`.

## npm: production dependencies are clean

`npm audit fix` (non-breaking) was applied to all three packages on
2026-10-07, which cleared every production advisory:

| Package | Production | Dev (was -> now) |
|---|---|---|
| `desktop/` | 0 (was 5) | 41 -> 34 (2 critical, 16 high remain) |
| `browser-extension/` | 0 | 9 -> 3 (2 critical, 1 moderate) |
| `polar-webhook/` | 0 | 4 -> 3 (high) |

`npm audit fix --force` was then tried on all three (2026-10-07):

- `browser-extension/`: vitest 3 -> 5 clears everything (0 advisories); tests
  19/19. **Kept.**
- `desktop/`: **rejected.** It jumps Svelte 4 -> 5, SvelteKit 2 -> 3, Vite 5 ->
  8 and `vite build` fails (`svelte.config.js` is no longer read in SvelteKit
  3). It would also still leave 18 dev advisories. Treat it as a planned
  framework migration, not an audit fix. Dev-only advisories remain (34), none
  in production dependencies or in anything shipped.
- `polar-webhook/`: **rejected.** `--force` rewrote `wrangler` to `^4.15.2`
  (a downgrade of the declared range) and still left 6 dev advisories (miniflare
  / `ws`, dev tooling only). Revisit when a newer `wrangler` patches them.

## Known test-environment issue (not a dependency problem)

`tests::enable_cloud_backup_requires_backup_email_and_smtp` fails on a
developer machine that already has a Perpetua backup key in the OS keyring for
user id 1 ("first enable generates a key"), because the Rust tests use the
real keyring. It fails identically on the pre-update lockfile. Tests should use
an isolated keyring/service name.
