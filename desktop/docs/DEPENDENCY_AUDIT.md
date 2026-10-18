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

A framework migration then cleared the `desktop/` dev advisories (2026-10-08):

- Svelte 4 -> 5, SvelteKit 2 -> 3, `@sveltejs/adapter-static` 3 -> 4,
  `@sveltejs/vite-plugin-svelte` 3 -> 7, Vite 5 -> 8, Vitest 3 -> 5, TypeScript
  5.9 -> 6, ESLint 8 -> 9, `typescript-eslint` 6 -> 8, `eslint-plugin-svelte`
  2 -> 3, `svelte-check` 3 -> 4, `cspell` 10.3.
- SvelteKit 3 changes made along the way: configuration moved from
  `svelte.config.js` into the `sveltekit()` plugin in `vite.config.ts`
  (flattened, no `kit` namespace); `$lib` imports became `#lib` subpath imports
  (`package.json` `imports`); `tsconfig.json` extends `$app/tsconfig`;
  `.eslintrc.cjs`/`.eslintignore` became `eslint.config.js`.
- Tests: `svelteTesting()` Vite plugin; `component.$on` replaced by the `events`
  mount option; `vault.test.ts` loads Testing Library after `vi.resetModules()`
  so the page and renderer share one Svelte runtime.
- Result: `desktop/` 41 -> 9 dev advisories, 0 production.

The 9 left are all in `markdownlint-cli2@0.23.3` (its latest release): `braces`
3.0.3 (no patched release exists; the advisory covers the newest 3.x),
`micromatch`, `fast-glob`, `globby`, `smol-toml`, `katex` and friends. They are a
denial-of-service risk when linting markdown, and only on a developer machine.
Replace or drop the markdown linter if the noise matters.

`browser-extension/`: vitest 3 -> 5 clears everything (0 advisories); tests
19/19.

`polar-webhook/`: `npm audit fix --force` was **rejected**. It rewrote `wrangler`
to `^4.15.2` (a downgrade of the declared range) and still left 6 dev advisories
(miniflare / `ws`, dev tooling only). Revisit when a newer `wrangler` patches
them.

**Not verified:** the Playwright E2E suite (`desktop/e2e`) and a visual check of
the packaged app under Svelte 5 were not run. Unit/component tests, `svelte-check`,
ESLint and the production build all pass.

## Known test-environment issue (not a dependency problem)

`tests::enable_cloud_backup_requires_backup_email_and_smtp` fails on a
developer machine that already has a Perpetua backup key in the OS keyring for
user id 1 ("first enable generates a key"), because the Rust tests use the
real keyring. It fails identically on the pre-update lockfile. Tests should use
an isolated keyring/service name.
