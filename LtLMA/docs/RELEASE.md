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

## One-command Polar-enabled release

From `LtLMA/`:

```powershell
npm ci
.\build-release.ps1
```

`build-release.ps1` sets `POLAR_ORGANIZATION_ID` (public org id), clears a
sandbox `CARGO_TARGET_DIR` redirect (unless `PERPETUA_KEEP_CARGO_TARGET_DIR=1`),
and runs `npm run tauri build`. Bundle targets are **MSI + NSIS**
(`tauri.conf.json`).

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

```powershell
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
