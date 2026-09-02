# Perpetua — Lifetime License Manager

Local-first **desktop** vault for lifetime software licenses: keep-alive reminders, vault export/backup, and Pro unlock (Polar or offline keys).

Built with **Tauri 2 + SvelteKit (Svelte 4) + Rust/Axum + SQLite**.

**Version:** 1.0.0  
**Brand:** Perpetua (folder: `LtLMA/`)  
**License:** Proprietary — see [../LICENSE](../LICENSE) and [legal/](./legal/)

---

## Quick Start

```powershell
# Install dependencies
npm ci

# Desktop app (dev mode) — Vite + Tauri shell
npm run tauri dev

# Frontend only (http://localhost:5173)
npm run dev

# Quality gates
npm test
cd src-tauri; cargo test; cd ..
npm run check
```

### Desktop release build

```powershell
npm ci
.\build-release.ps1
# Or without Polar bake-in:
# npm run tauri build
```

Artifacts (after success):

| Artifact | Path |
|----------|------|
| Executable | `src-tauri\target\release\perpetua.exe` |
| NSIS | `src-tauri\target\release\bundle\nsis\Perpetua_1.0.0_x64-setup.exe` |
| MSI | `src-tauri\target\release\bundle\msi\Perpetua_1.0.0_x64_en-US.msi` |

Full path + smoke checklist: [docs/RELEASE.md](./docs/RELEASE.md) · [docs/SMOKE_TEST.md](./docs/SMOKE_TEST.md)

---

## Features (implemented behavior)

| Feature | Behavior |
|---------|----------|
| Local account | Register / login with bcrypt + JWT |
| License vault | CRUD, dashboard stats, sites, reminders |
| Keep-alive | Due notices + tray/background scheduler; vendor policy suggest (Phase 1) |
| Free / Pro | Free cap 3 licenses; Pro via Polar activate, or offline fulfillment keys (internal builds only) |
| Vault tools | JSON/CSV export, import, rotated SQLite backups |
| Packaging | MSI + NSIS targets; unsigned direct-download MVP |

Archive docs under [`docs/archive/`](./docs/archive/) are historical and not authoritative for 1.0.0.

---

## Architecture

- **Frontend**: SvelteKit SPA (`adapter-static` → `build/`) inside Tauri WebView
- **Backend**: Axum on `127.0.0.1:18765` (embedded; override with `PERPETUA_API_PORT` / `VITE_PERPETUA_API_PORT`)
- **Database**: SQLite under the OS app-data directory (+ local backups)
- **Shell**: Tauri 2 tray, autostart, native notifications
- **CLI helpers**: `perpetua serve`, `perpetua check-reminders`, `perpetua config` (`perpetua mint-key` also exists in debug builds and internal fulfillment builds — not in the customer-facing release binary; see `docs/TESTING.md`)

---

## Package layout

- `src\` — SvelteKit desktop UI
- `src-tauri\` — Rust/Tauri shell + local API
- `assets\branding\` — distribution branding source
- `legal\` — Privacy, Terms, Support
- `docs\` — RELEASE, TESTING, SMOKE_TEST, keep-alive roadmap

---

## Security notes

- Passwords hashed with bcrypt; no telemetry
- SQLite is **not encrypted at rest** (disclosed in Privacy + README)
- Polar org id may be baked at compile time (public id, not a secret)

---

## Legal

- [LICENSE](../LICENSE) — proprietary commercial terms  
- [legal/PRIVACY.md](./legal/PRIVACY.md) · [legal/TERMS.md](./legal/TERMS.md) · [legal/SUPPORT.md](./legal/SUPPORT.md)
