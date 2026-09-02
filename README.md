# PERPETUA

Local-first lifetime license manager.

**Perpetua** — [`LtLMA/`](./LtLMA/) — Desktop app (Tauri 2 + SvelteKit + Rust/Axum + SQLite), plus a companion browser extension ([`LtLMA/browser-extension/`](./LtLMA/browser-extension/)) that captures license purchases from deal sites straight into your local vault.

**Version:** 1.0.0 (`LtLMA/`)

## Quick start

```powershell
cd LtLMA
npm ci
npm run tauri dev
```

### Release build

```powershell
cd LtLMA
npm ci
.\build-release.ps1
```

Produces `perpetua.exe` plus MSI/NSIS under `LtLMA\src-tauri\target\release\`.
Details: [`LtLMA/docs/RELEASE.md`](./LtLMA/docs/RELEASE.md) · smoke: [`LtLMA/docs/SMOKE_TEST.md`](./LtLMA/docs/SMOKE_TEST.md)

### Using Perpetua

- [`LtLMA/docs/USER_GUIDE.md`](./LtLMA/docs/USER_GUIDE.md) — features, walkthroughs
- [`LtLMA/docs/TROUBLESHOOTING.md`](./LtLMA/docs/TROUBLESHOOTING.md) — common issues
- [`LtLMA/docs/STATUS.md`](./LtLMA/docs/STATUS.md) — what works, what doesn't yet, what's next

## Legal

- Root [`LICENSE`](./LICENSE) — proprietary commercial terms
- Product pack: [`LtLMA/legal/`](./LtLMA/legal/) — Privacy, Terms/EULA, Support

## CI

- Quality gates: [`.github/workflows/perpetua-ci.yml`](./.github/workflows/perpetua-ci.yml)
- Release builds: [`.github/workflows/release.yml`](./.github/workflows/release.yml)

## Hygiene

- `oracleJdk-26/` is **not** product code; exclude from distribution archives.
- Local `*.db` / `.env*` may contain secrets — do not publish.

## Status

See [`LtLMA/docs/STATUS.md`](./LtLMA/docs/STATUS.md) for what works, what
doesn't yet, and what's next as of the current release.
