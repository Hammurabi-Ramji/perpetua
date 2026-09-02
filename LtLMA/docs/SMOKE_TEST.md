# Perpetua — Smoke Test (v1.0.0)

Manual critical-path checklist. Sign off only what you actually ran.

**Environment:** Windows 10/11 · Perpetua 1.0.0  
**Date:** _______________  
**Tester:** _______________

## Critical path (desktop)

- [ ] `npm ci` in `LtLMA/`
- [ ] `npm run tauri dev` launches UI (login/register)
- [ ] Register a local account and land on dashboard
- [ ] Add 3 licenses → 4th hits paywall (HTTP 402 / upgrade UI)
- [ ] Activate with minted Pro key **or** Polar flow when org is baked
- [ ] Set keep-alive days (or accept vendor suggestion) → trigger / wait for reminder path
- [ ] **Mark as used** resets keep-alive clock
- [ ] Vault → export JSON + create backup
- [ ] Vault → Cloud backup: enable against a real WebDAV account, confirm
      the recovery-key email arrives, run "Back up to cloud now"
- [ ] Sign-in screen → Restore from cloud backup, against a fresh data dir
      (`perpetua serve <alt-dir>`), recovers the vault with no prior login
- [ ] Vault → reveal a browser-extension token; pair `browser-extension/`
      loaded unpacked and confirm a sync from a real deal-site account page
- [ ] Close window → app stays in tray; Quit from tray exits

## CLI / headless

- [ ] `perpetua config` prints Polar ENABLED or DISABLED
- [ ] `perpetua mint-key test@example.com` prints a key (fulfillment helper)
- [ ] `perpetua serve <temp-dir>` starts API without window (optional)

## Installer

- [x] `.\build-release.ps1` produces NSIS + MSI — succeeded 2026-07-19 (`Perpetua_1.0.0_x64_*`)
- [x] Run `src-tauri\target\release\perpetua.exe` once (smoke launch) — process started; `perpetua config` → Polar ENABLED; `/api/health` on `:18765`
- [ ] Install on clean machine / VM (optional)
- [ ] Code signing: skipped without cert (SmartScreen may warn)

## Automated gate (developer)

- [ ] `cd src-tauri && cargo test`
- [ ] `npm test` (Vitest)
- [ ] `cd browser-extension && npm test`
- [ ] `npm run check` + `npm run build`

## Sign-off

| Item | Result |
|------|--------|
| Critical desktop path | Pass / Fail / Not run |
| Release exe smoke launch | Pass / Fail / Not run |
| Installer smoke | Pass / Fail / Not run |

**Notes:**

---

**Status:** Template for v1.0.0 ops-ready cut — complete checkboxes during your smoke run.
