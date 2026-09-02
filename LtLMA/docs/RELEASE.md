# Perpetua — Reproducible release build

This is the canonical path to produce a **marketable Windows desktop installer**
for the launch product (folder: `LtLMA/`).

## Prerequisites

| Tool | Notes |
|------|--------|
| Node.js 18+ | `npm` available on PATH (`pnpm` optional; scripts use `npm`) |
| Rust stable | `rustc` / `cargo` |
| WebView2 | Preinstalled on modern Windows 10/11 |
| Visual Studio Build Tools | C++ workload (Tauri Windows requirement) |
| Tauri CLI | Provided via `npm` (`@tauri-apps/cli` in this package) |

Optional: code-signing certificate for store / SmartScreen trust (not required
for a local/direct-download MVP; unsigned builds may show OS warnings).

**Required:** `PERPETUA_LICENSE_SECRET` set in your shell environment before
building. Release builds (`not(debug_assertions)`) fail to *compile*
without it — the offline license-verification secret is never allowed to
silently fall back to an unset/default value in a shipped binary.
`build-release.ps1` asserts this up front with a clear error if it's
missing. This is a real secret (see `SUPPORT.md`/your password manager for
where it's stored) — never commit it, and treat it as compromised if it
ever ends up in a chat log, a screenshot, or source control.

## One-command Polar-enabled release

From `LtLMA/`:

```powershell
$env:PERPETUA_LICENSE_SECRET = "<the real secret, from your password manager>"
npm ci
.\build-release.ps1
```

`build-release.ps1` checks `PERPETUA_LICENSE_SECRET` is set, sets
`POLAR_ORGANIZATION_ID` (public org id), clears a sandbox `CARGO_TARGET_DIR`
redirect (unless `PERPETUA_KEEP_CARGO_TARGET_DIR=1`), and runs
`npm run tauri build`. Bundle targets are **MSI + NSIS** (`tauri.conf.json`).

### Output locations (Windows)

After a successful build (default Cargo target dir):

| Artifact | Typical path |
|----------|----------------|
| Executable | `src-tauri\target\release\perpetua.exe` |
| NSIS setup | `src-tauri\target\release\bundle\nsis\Perpetua_1.0.0_x64-setup.exe` |
| MSI | `src-tauri\target\release\bundle\msi\Perpetua_1.0.0_x64_en-US.msi` |

If you keep `CARGO_TARGET_DIR` set, artifacts land under that directory’s
`release\` / `release\bundle\` instead — check the Tauri “Finished 2 bundles at:”
lines.

Smoke checklist template: [SMOKE_TEST.md](./SMOKE_TEST.md).

**Verified 2026-07-19 (this machine):** `.\build-release.ps1` exit 0 →
`perpetua.exe` + MSI + NSIS under `src-tauri\target\release\` (in-tree).
Local API listens on **`127.0.0.1:18765`** (avoids Win11 Hyper-V exclusion of
3000/3001). Smoke: `perpetua config` → Polar ENABLED; `serve` + GUI
`/api/health` → 200. Unsigned build (SmartScreen may warn).

### Offline / no Polar bake

Still needs `PERPETUA_LICENSE_SECRET` set — that requirement is independent
of Polar.

```powershell
$env:PERPETUA_LICENSE_SECRET = "<the real secret>"
npm ci
npm run tauri build
```

Without `POLAR_ORGANIZATION_ID`, Polar activate stays disabled; Pro unlock
still works via offline `perpetua mint-key` HS256 keys.

## Smoke checklist (clean machine)

1. Install from the NSIS/MSI artifact (or run `perpetua.exe`).
2. Register a local account.
3. Add 3 licenses → 4th hits paywall (HTTP 402 / upgrade modal).
4. Activate with a minted Pro key **or** Polar flow when org is baked.
5. Set keep-alive days (or accept vendor suggestion) → wait for / trigger
   reminder → **Mark as used**.
6. Vault → export JSON + create backup.
7. Set up backup email + SMTP, then enable cloud backup against a real
   WebDAV target and confirm the recovery-key email arrives — not yet
   re-verified against a real release build as of this doc's last edit,
   only against `cargo tauri dev`.
8. Load `browser-extension/` unpacked, pair it with a token from Vault
   Tools, and confirm a sync against a real deal-site account page.

## Checksums (recommended before publish)

```powershell
Get-FileHash .\src-tauri\target\release\perpetua.exe -Algorithm SHA256
Get-ChildItem .\src-tauri\target\release\bundle -Recurse -Include *.exe,*.msi |
  ForEach-Object { Get-FileHash $_.FullName -Algorithm SHA256 }
```

Publish hashes next to the download link. **Do not commit** large binaries into
git unless your distribution policy requires it; CI/artifacts or release
attachments are preferred.

## Related

- Quality gates: [TESTING.md](./TESTING.md)
- Legal pack: `../legal/` (Privacy, Terms, Support)
- Root product map: `../../README.md`
