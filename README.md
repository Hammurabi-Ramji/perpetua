# Perpetua

Local-first lifetime license manager.

Perpetua is a desktop vault for the lifetime software licenses you buy on
deal sites: it stores the keys locally, reminds you before a vendor's
keep-alive window lapses, and (on Pro) backs the vault up encrypted to your
own WebDAV storage. A companion browser extension captures purchases from
AppSumo, Product Hunt, StackSocial and Humble Bundle straight into the vault.

**Version:** 1.0.0 · **License:** proprietary, see [`LICENSE`](./LICENSE)

## Repository layout

| Path | What it is |
|------|------------|
| [`desktop/`](./desktop/) | The Perpetua desktop app — Tauri 2 shell, SvelteKit UI, Rust/Axum local API on `127.0.0.1:18765`, SQLite vault. Ships as MSI/NSIS (Windows), DMG (macOS), deb/rpm/AppImage (Linux). |
| [`browser-extension/`](./browser-extension/) | Manifest V3 companion extension (Chrome/Edge). Talks only to the local API. |
| [`polar-webhook/`](./polar-webhook/) | Cloudflare Worker that receives Polar.sh order webhooks (purchase side of Pro). |
| [`docs/`](./docs/) | Repository-level docs: [`REMAINING_TASKS.md`](./docs/REMAINING_TASKS.md) is the owner/engineering backlog. `docs/internal/` (git-ignored) holds audit and pricing working papers. |
| [`.github/workflows/`](./.github/workflows/) | [`perpetua-ci.yml`](./.github/workflows/perpetua-ci.yml) quality gates; [`release.yml`](./.github/workflows/release.yml) tagged multi-OS release builds. |

Component-level READMEs: [`desktop/README.md`](./desktop/README.md) ·
[`browser-extension/README.md`](./browser-extension/README.md) ·
[`polar-webhook/README.md`](./polar-webhook/README.md)

## Quick start

```powershell
cd desktop
npm ci
npm run tauri dev
```

Requires Node 22+, a stable Rust toolchain and the
[Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

### Release build

```powershell
cd desktop
npm ci
.\build-release.ps1          # needs PERPETUA_LICENSE_SECRET; bakes in Polar activation
```

Produces `perpetua.exe` plus MSI/NSIS under `desktop\src-tauri\target\release\`.
Details: [`desktop/docs/RELEASE.md`](./desktop/docs/RELEASE.md) ·
smoke: [`desktop/docs/SMOKE_TEST.md`](./desktop/docs/SMOKE_TEST.md) ·
clean-machine install: [`desktop/docs/INSTALL_SMOKE.md`](./desktop/docs/INSTALL_SMOKE.md)

### Tests

```powershell
cd desktop;           npm test; npm run check; cd src-tauri; cargo test; cd ..\..
cd browser-extension; npm test; cd ..
cd polar-webhook;     npm test; npm run typecheck; cd ..
```

## Using Perpetua

- [`desktop/docs/USER_GUIDE.md`](./desktop/docs/USER_GUIDE.md) — features, walkthroughs
- [`desktop/docs/TROUBLESHOOTING.md`](./desktop/docs/TROUBLESHOOTING.md) — common issues
- [`desktop/docs/STATUS.md`](./desktop/docs/STATUS.md) — what works, what doesn't yet, what's next
- Support mailbox: `hcc@hammurabicodingcompany.com` ([`desktop/legal/SUPPORT.md`](./desktop/legal/SUPPORT.md)). A purchase is a one-time software license, not a lifetime support plan ([`desktop/legal/TERMS.md`](./desktop/legal/TERMS.md)).

## Legal

- [`LICENSE`](./LICENSE) — proprietary commercial terms (applies to the whole repository)
- [`desktop/legal/`](./desktop/legal/) — Privacy, Terms/EULA, Support — the product pack shipped with the app

## Hygiene

- Secrets never live in the tree: `.env*` (except `.env.example`), `*.db` and
  `docs/internal/` are git-ignored. Build-time secrets come from repository
  secrets (`PERPETUA_LICENSE_SECRET`, `POLAR_ORGANIZATION_ID`); see
  [`desktop/.env.example`](./desktop/.env.example) for the public commerce vars.
- Anything else sitting next to this file that is not listed in the layout
  table above is local scratch and must not be shipped or committed.
