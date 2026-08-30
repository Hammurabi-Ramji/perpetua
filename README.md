# PERPETUA

Dual-edition lifetime license management tree.

| Edition | Path | Role |
|---------|------|------|
| **Perpetua** (launch) | [`LtLMA/`](./LtLMA/) | Local-first **desktop** app (Tauri 2 + SvelteKit + Rust/Axum + SQLite) |
| **LicenseVault** (secondary) | [`LtLM/`](./LtLM/) | Web API + React UI + browser / VS Code extensions |

Market name for the shipping desktop product: **Perpetua**.  
LicenseVault remains the brand for the web/capture surfaces.

**Desktop version:** 1.0.0 (`LtLMA/`)

## Quick start (desktop — launch product)

```powershell
cd LtLMA
npm ci
npm run tauri dev
```

### Desktop release build

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

## Legal

- Root [`LICENSE`](./LICENSE) — proprietary commercial terms  
- Product pack: [`LtLMA/legal/`](./LtLMA/legal/) — Privacy, Terms/EULA, Support  

## CI

- Desktop gates: [`.github/workflows/perpetua-ci.yml`](./.github/workflows/perpetua-ci.yml) → `LtLMA/`  
- Web/deploy: [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) → `LtLM/`  

## Hygiene

- `oracleJdk-26/` is **not** product code; exclude from distribution archives.
- Local `*.db` / `.env*` may contain secrets — do not publish.

## Status

See [`PROJECT-STATUS-AUDIT.md`](./PROJECT-STATUS-AUDIT.md) and [`SSOT.md`](./SSOT.md)
(`UD-20260719-PERPETUA`).
