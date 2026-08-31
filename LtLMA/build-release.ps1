# Perpetua production build (Polar-enabled).
#
# Bakes the Polar organization id into the binary at compile time so license
# activation routes through Polar's API. The org id is public (not a secret).
#
# Usage (from LtLMA/):
#   npm ci
#   .\build-release.ps1
#
# Outputs (after success):
#   src-tauri\target\release\perpetua.exe
#   src-tauri\target\release\bundle\nsis\*.exe  (and/or msi\)
# See docs\RELEASE.md for the full reproducible path and smoke checklist.

$ErrorActionPreference = "Stop"

if (-not $env:PERPETUA_LICENSE_SECRET) {
    throw "PERPETUA_LICENSE_SECRET is not set. Release builds fail to compile without it " + `
        "(src-tauri/src/services.rs requires it via env! for non-debug builds) so the " + `
        "offline license-verification secret is never silently unset in a shipped binary. " + `
        "Set it to the production secret before building."
}

$env:POLAR_ORGANIZATION_ID = "2cee7fb6-a84f-442d-b2a2-5eb396253a85"

Write-Host "Building Perpetua with Polar activation enabled (org $env:POLAR_ORGANIZATION_ID)..."
Write-Host "Working directory: $(Get-Location)"

if (-not (Test-Path -LiteralPath "package.json")) {
    throw "Run this script from the LtLMA/ directory (package.json not found)."
}

if (-not (Test-Path -LiteralPath "node_modules")) {
    Write-Host "node_modules missing - running npm ci..."
    npm ci
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed with exit code $LASTEXITCODE"
    }
}

# Prefer in-tree Cargo target so installers land under src-tauri\target\release.
# Cursor/sandbox hosts often set CARGO_TARGET_DIR to a temp cache - override unless
# the operator explicitly keeps it (PERPETUA_KEEP_CARGO_TARGET_DIR=1).
if ($env:PERPETUA_KEEP_CARGO_TARGET_DIR -ne "1") {
    if ($env:CARGO_TARGET_DIR) {
        Write-Host "Clearing CARGO_TARGET_DIR ($env:CARGO_TARGET_DIR) for in-tree release artifacts."
        Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
    }
}

# npm writes warnings to stderr; do not treat those as terminating errors.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
npm run tauri build
$buildExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap

if ($buildExit -ne 0) {
    throw "tauri build failed with exit code $buildExit"
}

$releaseDir = Join-Path (Get-Location).Path "src-tauri\target\release"
$exePath = Join-Path $releaseDir "perpetua.exe"
$bundleDir = Join-Path $releaseDir "bundle"

Write-Host ""
Write-Host "Build finished."
if (Test-Path -LiteralPath $exePath) {
    $hash = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash
    Write-Host "EXE:  $exePath"
    Write-Host "SHA256: $hash"
} else {
    Write-Warning "Expected EXE not found at $exePath - check Tauri output above."
}

if (Test-Path -LiteralPath $bundleDir) {
    Write-Host "Bundle dir: $bundleDir"
    Get-ChildItem -LiteralPath $bundleDir -Recurse -Include *.exe, *.msi -ErrorAction SilentlyContinue |
        ForEach-Object { Write-Host "  $($_.FullName)" }
} else {
    Write-Warning "Bundle directory not found yet at $bundleDir"
}

Write-Host ""
Write-Host "Next: smoke-test per docs/RELEASE.md (register -> 3 licenses -> paywall -> activate -> keep-alive)."
