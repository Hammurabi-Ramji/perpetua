# Perpetua — Smoke Test (clean-machine checklist)

Executable checklist for a **fresh Windows 11 VM** (no dev tools, no prior Perpetua data).
Sign off only what you actually ran. Record Pass / Fail / Blocked and notes in the results table at the end.

**Build under test:** _______________  **Date:** _______________  **Tester:** _______________
**Prereqs:** unsigned MSI + NSIS installers from `.\build-release.ps1`; a Polar **sandbox** org with a product and a 100%-off discount code; an SMTP account reachable on ports 465 and 587; a WebDAV account for cloud backup; Chrome with `browser-extension/` loaded unpacked; an AppSumo-style deal page/account.

## 1. Install (QA-06 core)

| # | Step | Expected |
|---|------|----------|
| 1.1 | Copy the unsigned **MSI** to the VM and run it | SmartScreen shows "Windows protected your PC" (unsigned). "More info" -> "Run anyway" lets install proceed. Installs without errors. |
| 1.2 | Uninstall, then repeat with the **NSIS** setup `.exe` | Same SmartScreen behaviour; install succeeds; Start-menu entry present. |
| 1.3 | Reboot / sign out and in | Perpetua does **NOT** autostart and no window opens (maximized or otherwise) at login. |
| 1.4 | Enable the "start at login" setting, sign out/in | App now starts at login; window is not maximized unless the setting says so. Disable again afterwards. |
| 1.5 | Close window | App stays in tray; "Quit" from tray exits the process. |

## 2. Accounts, licences, paywall

| # | Step | Expected |
|---|------|----------|
| 2.1 | Register a local account | Lands on dashboard. |
| 2.2 | Add 3 licences | All three saved. |
| 2.3 | Add a 4th | Paywall / upgrade UI (HTTP 402). **Buy button** either opens the Polar checkout, or is visibly disabled with an explanation. It must never be a dead click. |
| 2.4 | Delete a licence | Confirmation dialog appears; cancel keeps it, confirm removes it. |

## 3. Polar sandbox purchase -> Pro

| # | Step | Expected |
|---|------|----------|
| 3.1 | Click Buy, apply the 100%-off sandbox discount code, complete checkout | Order completes with $0 total. |
| 3.2 | Return to the app, activate (key from email / auto-activation) | Account shows **Pro**; 4th and further licences can be added. |
| 3.3 | Terminal: `perpetua config` | Prints Polar **ENABLED**. |
| 3.4 | Terminal: `perpetua mint-key test@example.com` (optional) | Prints a key. |

## 4. Keep-alive and reminders

| # | Step | Expected |
|---|------|----------|
| 4.1 | Set keep-alive days short (or backdate) on a licence | Keep-alive reminder fires (desktop toast + in-app). |
| 4.2 | Click **Mark as used** | Keep-alive clock resets; reminder clears. |
| 4.3 | Settings: turn **desktop reminders OFF**, trigger another due reminder | No toast shown (in-app indicator may remain). |
| 4.4 | Turn desktop reminders back ON, trigger again | Toast shown. |

## 5. Password reset email (SMTP)

| # | Step | Expected |
|---|------|----------|
| 5.1 | Settings -> SMTP: host, **port 465**, credentials; press **Send test email** | Test email arrives; UI reports success. |
| 5.2 | Change to **port 587** (STARTTLS); press **Send test email** | Test email arrives; UI reports success. |
| 5.3 | Sign-out -> "Forgot password" | Reset email arrives (try on whichever port is configured, ideally both); link/code resets the password; sign in with the new one. |
| 5.4 | Bad credentials | Clear error, no crash. |

## 6. Vault, cloud backup, restore

| # | Step | Expected |
|---|------|----------|
| 6.1 | Vault -> export JSON + create local backup | Files produced. |
| 6.2 | Vault -> Cloud backup: enable against WebDAV | Recovery-key email arrives. |
| 6.3 | "Back up to cloud now" | Success; remote file present. |
| 6.4 | Launch with a **fresh data dir** (`perpetua serve <alt-dir>`), sign-in screen -> Restore from cloud backup | Vault restored with no prior login. |
| 6.5 | Repeat restore against a data dir that already has accounts, without signing in | **Refused** unless the user signs in / explicitly confirms; existing data not overwritten silently. |

## 7. Browser extension sync

| # | Step | Expected |
|---|------|----------|
| 7.1 | Vault -> reveal extension token; pair the unpacked extension | Pairing succeeds. |
| 7.2 | Open a deal-site account page with a **dated AppSumo purchase**; sync | Licence appears in Perpetua with the purchase date; a **notification is shown** for the sync. |

## 8. Developer / automated gate (not on the clean VM)

- [ ] `cd src-tauri && cargo test`
- [ ] `npm test` (Vitest)
- [ ] `cd browser-extension && npm test`
- [ ] `npm run check` + `npm run build`
- [ ] `.\build-release.ps1` produces NSIS + MSI (last known good 2026-07-19, `Perpetua_1.0.0_x64_*`)
- [ ] `perpetua serve <temp-dir>` starts the API headless (`/api/health` on `:18765`)

## Results

| Area | Section | Result (Pass/Fail/Blocked) | Notes / bug link |
|------|---------|---------------------------|------------------|
| Install MSI + SmartScreen | 1.1 | | |
| Install NSIS | 1.2 | | |
| No autostart / not maximized | 1.3-1.4 | | |
| Tray behaviour | 1.5 | | |
| Register + 3 licences + paywall + Buy | 2.1-2.3 | | |
| Delete confirmation | 2.4 | | |
| Polar sandbox -> Pro | 3.1-3.2 | | |
| `perpetua config` ENABLED | 3.3 | | |
| Keep-alive + Mark as used | 4.1-4.2 | | |
| Desktop reminders off => no toast | 4.3-4.4 | | |
| SMTP 465 | 5.1 | | |
| SMTP 587 | 5.2 | | |
| Password reset | 5.3-5.4 | | |
| Cloud backup + back up now | 6.1-6.3 | | |
| Restore on fresh dir | 6.4 | | |
| Restore refused with existing accounts | 6.5 | | |
| Extension sync + notification | 7.1-7.2 | | |
| Automated gate | 8 | | |

**Overall:** Pass / Fail   **Notes:**
