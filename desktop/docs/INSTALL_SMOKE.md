# Perpetua - Clean-machine install smoke

Closes the "clean-machine MSI/NSIS install smoke" gap (owner action O8 in `docs/REMAINING_TASKS.md`).
Complements the checklist in [RELEASE.md](./RELEASE.md) and [SMOKE_TEST.md](./SMOKE_TEST.md).

Label key: **Built** = artifact/script exists. **Verified** = actually run, evidence below.
**Unverified** = not run; a human must do it.

## Status (authoring run 2026-10-06)

| Claim | Label | Evidence |
|-------|-------|----------|
| MSI exists: `src-tauri\target\release\bundle\msi\Perpetua_1.0.0_x64_en-US.msi` (16,052,224 B, mtime 2026-09-07) | Verified | `Get-ChildItem` |
| SHA256 of MSI = `DCE57584959B4D6D8CD5DB97028D2CCF0E6BFC74F1C8A1964DA14EF144C0B965` | Verified | `Get-FileHash` |
| MSI is not Authenticode-signed | Verified | `Get-AuthenticodeSignature` = NotSigned |
| NSIS `Perpetua_1.0.0_x64-setup.exe` exists | **Not present** | `bundle\nsis\` absent; `target\release\perpetua.exe` also absent (RELEASE.md says all three were built 2026-07-19; the tree has since been partly cleaned/rebuilt, MSI only). NSIS is Unverified in every respect. |
| MSI metadata (read-only tables) | Verified | ProductName Perpetua, ProductVersion 1.0.0, Manufacturer Hammurabi Coding Company, LLC, ProductCode `{F85687D4-F5A4-45B9-B8E1-5713E92A45BA}`, UpgradeCode `{94114E5B-57F1-5E73-98B4-3C77C89E17BD}`, ALLUSERS=1 (per-machine, needs elevation), install dir `%ProgramFiles%\Perpetua`, Start Menu + Desktop + "Uninstall Perpetua" shortcuts, WixUI_InstallDir wizard with "Launch Perpetua" exit checkbox, `ARPNOMODIFY=1`, `ARPNOREPAIR=yes` |
| MSI downloads WebView2 bootstrapper from `go.microsoft.com/fwlink/p/?LinkId=2124703` if needed (custom action `DownloadAndInvokeBootstrapper`) | Verified (from tables) | Needs network on a machine lacking WebView2; behaviour itself Unverified |
| Payload = single `perpetua.exe`, 29,651,968 B, SHA256 `AAAC55066901EE130064D803D0667EF957CAC95BD99C14C3A797BFB6290D6CE8`, FileVersion 1.0.0, unsigned | Verified | `msiexec /a` administrative extract to scratch dir (does not install) |
| Embedded exe: `config` -> "Polar activation: ENABLED"; `serve` on scratch port/data dir -> `/api/health` ok; register + 3 licenses = 201, 4th = **402** paywall | Verified (headless, host, not installed) | `Verify-Installers.ps1` |
| Silent switches: MSI `msiexec /i <msi> /qn /norestart`; NSIS `/S` (Tauri/NSIS default) | MSI Verified standard; NSIS Unverified (no NSIS artifact to inspect) | - |
| Windows Sandbox available on this host | **No** | `C:\Windows\System32\WindowsSandbox.exe` absent. `Get-WindowsOptionalFeature` needs elevation and was not run elevated, so feature state is inferred from the missing exe. |
| Actual install -> launch -> uninstall on a clean machine | **Unverified** | Not run (task forbade installing on the host; no sandbox/VM available) |
| Install UX (wizard screens, SmartScreen, UAC, shortcuts, uninstall) | **Unverified** | Needs a human; checklist below |

## What is in `scripts/install-smoke/`

| File | Label | Purpose |
|------|-------|---------|
| `Verify-Installers.ps1` | Built + Verified (run on host 2026-10-06) | Host-safe static checks above. Installs nothing. Uses scratch dir under `%TEMP%`, port 18799. |
| `Run-InstallSmoke.ps1` | Built, **never run** (parses clean under PS 5.1 parser) | Run INSIDE a disposable clean machine. Silent install (MSI `/qn`, or NSIS `/S`), checks ARP entry, exe, version, shortcuts, launches, waits for window title, polls `/api/health` on 18765, confirms loopback-only bind, registers a throwaway user and checks the 402 paywall on the installed build, checks close-to-tray keeps the API alive, checks HKCU autostart entry, uninstalls, then checks files/ARP/shortcuts/port released and flags a dangling autostart Run key. Writes `results.md`, `results.json`, `transcript.txt`, MSI logs. Refuses to run without `-IUnderstandThisInstalls`. |
| `perpetua-install-smoke.wsb` | Built, **never run** | Windows Sandbox config that maps the bundle dir (read-only), the scripts (read-only), and `docs\internal\audit-artifacts\install-smoke` (writable results, git-ignored) and runs the script at logon. Create the results dir first. |

### Option A - Windows Sandbox (needs a Pro/Enterprise host)

```powershell
# elevated, then reboot
Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All
mkdir C:\IEDB\PERPETUA\docs\internal\audit-artifacts\install-smoke
# then double-click desktop\scripts\install-smoke\perpetua-install-smoke.wsb
```

Read `docs\internal\audit-artifacts\install-smoke\results.md`. Any FAIL row is a real finding. Note the sandbox
has no Credential Manager state and a fresh profile, which is the point.

### Option B - Hyper-V / VMware VM with a checkpoint

Copy the MSI and `Run-InstallSmoke.ps1` in, then in an elevated PowerShell:

```powershell
.\Run-InstallSmoke.ps1 -Installer C:\drop\Perpetua_1.0.0_x64_en-US.msi -LogDir C:\drop\out -IUnderstandThisInstalls
```

Revert the checkpoint afterwards.

## Manual click-through checklist (interactive; what the script cannot judge)

Environment: clean Windows 10/11 x64 VM, standard internet, record OS build. Record each result
Pass / Fail / Not run. Take a screenshot at every wizard page.

**A. Pre-flight**
- [ ] Hash on the VM matches the published/expected SHA256 (`Get-FileHash`).
- [ ] No `C:\Program Files\Perpetua`, no `%APPDATA%\perpetua`, nothing on port 18765 (`netstat -ano | findstr 18765`).
- [ ] Note whether WebView2 is preinstalled (Win11 yes; bare Win10 may not).

**B. MSI interactive install** (double-click the .msi)
- [ ] SmartScreen/"unknown publisher" prompt appears (expected, unsigned). Record text; proceed via More info -> Run anyway.
- [ ] UAC elevation prompt (expected: per-machine install).
- [ ] Wizard shows Welcome -> (EULA page only if one is bundled; none confirmed) -> install-folder page (default `C:\Program Files\Perpetua`) -> Install -> Finish.
- [ ] Finish page has "Launch Perpetua" checkbox; leaving it ticked launches the app.
- [ ] If WebView2 was missing: install completes without hanging on the hidden PowerShell download; app window renders (not blank).
- [ ] Start Menu "Perpetua" shortcut and Desktop shortcut exist and open the app; icon is the Perpetua icon, not generic.
- [ ] Settings -> Apps lists "Perpetua 1.0.0, Hammurabi Coding Company, LLC"; size is sane; (Modify/Repair buttons intentionally disabled).

**C. NSIS interactive install** (only after the NSIS artifact is rebuilt; currently Unverified)
- [ ] Same SmartScreen note; decide per-user vs per-machine prompt; default path; Finish-page launch option; shortcuts; uninstaller registered.
- [ ] MSI and NSIS installed side by side is NOT supported - test on separate snapshots.

**D. First-run**
- [ ] Window opens maximized at login/register screen, title "Perpetua - Lifetime License Manager".
- [ ] Register local account -> dashboard.
- [ ] Add 3 licenses; 4th shows the paywall/upgrade modal.
- [ ] Close the window (X): app disappears but tray icon remains; tray -> Open Perpetua restores; tray -> Quit exits and frees port 18765.
- [ ] Windows notification permission/toast behaviour on first reminder (note any prompt).
- [ ] Windows Firewall does NOT prompt (API is loopback-only; a prompt would be a bug).
- [ ] Sign out/in of Windows (or reboot) with **Start Perpetua at login** left at its default (off): the app must NOT auto-start and no `HKCU\...\Run` entry must exist. Then turn the toggle on under Reminders, sign out/in again: the app starts minimised to the tray (no window), and `perpetua.log` records `started v1.0.0 (minimized=true)`.

**E. Upgrade / reinstall**
- [ ] Re-run the same MSI: handled as same-version (no duplicate ARP entry).
- [ ] Install an older/newer build over it, if available: UpgradeCode path replaces cleanly and the vault data survives.

**F. Uninstall**
- [ ] Via Settings -> Apps -> Uninstall and via Start Menu "Uninstall Perpetua".
- [ ] Running app is closed/handled (no "files in use" dead end).
- [ ] `C:\Program Files\Perpetua` removed; both shortcuts removed; ARP entry gone.
- [ ] `%APPDATA%\perpetua` (vault) is KEPT (expected). Reinstall -> prior login still works.
- [ ] Check `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` for a leftover Perpetua autostart entry after uninstall (suspected dangling-entry bug; Unverified) and `HKLM\Software\Hammurabi Coding Company, LLC\Perpetua`.

**G. Record**
- [ ] Attach `results.md` (if scripted), screenshots, OS build, and the installer SHA256 to the release notes.

## Known caveats / things the human should decide

1. The MSI in the tree is dated 2026-09-07 and `perpetua.exe` / NSIS are gone from `target\release`, while RELEASE.md says the 2026-07-19 build produced all three. `desktop/src-tauri/Cargo.toml` also has uncommitted changes. Whether this MSI matches the current source/commit is **Unverified**; rebuild with `.\build-release.ps1` (needs `PERPETUA_LICENSE_SECRET`) before the release smoke so MSI, NSIS and exe hashes are from one build.
2. Both installers are unsigned; SmartScreen warnings are expected until a certificate exists.
3. Steps 7-8 of the RELEASE.md smoke (cloud backup against real WebDAV/SMTP, browser extension pairing) remain outside this install smoke and are still Unverified on a release build.
