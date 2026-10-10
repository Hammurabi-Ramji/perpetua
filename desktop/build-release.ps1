# Perpetua production build (Polar-enabled).
#
# Bakes the Polar organization id into the binary at compile time so license
# activation routes through Polar's API. The org id is public (not a secret).
#
# Usage (from desktop/):
#   npm ci
#   .\build-release.ps1
#
# Outputs (after success):
#   src-tauri\target\release\perpetua.exe
#   src-tauri\target\release\bundle\nsis\*.exe  (and/or msi\)
#   src-tauri\target\release\bundle\SHA256SUMS.txt
# Optional signing: set PERPETUA_* env vars (see scripts\Sign-Windows.ps1 and
# docs\SIGNING-AND-STORE.md). With none set the build is unsigned, as before.
# See docs\RELEASE.md for the full reproducible path and smoke checklist.

$ErrorActionPreference = "Stop"

if (-not $env:PERPETUA_LICENSE_SECRET) {
    throw "PERPETUA_LICENSE_SECRET is not set. Release builds fail to compile without it " + `
        "(src-tauri/src/services.rs requires it via env! for non-debug builds) so the " + `
        "offline license-verification secret is never silently unset in a shipped binary. " + `
        "Set it to the production secret before building."
}

# Public Polar organization id. An explicit environment value wins (CI, or a
# sandbox dry-run against a different org); this is only the production default.
if (-not $env:POLAR_ORGANIZATION_ID) {
    $env:POLAR_ORGANIZATION_ID = "2cee7fb6-a84f-442d-b2a2-5eb396253a85"
}

# Commerce constants shown in the paywall (see .env.example). Not secrets, but
# a build without a checkout link ships a Buy button that only reaches the
# product page — make that visible at build time rather than in a customer's
# screenshot.
if (-not $env:VITE_PERPETUA_CHECKOUT_URL -and -not (Test-Path -LiteralPath ".env")) {
    Write-Warning "VITE_PERPETUA_CHECKOUT_URL is not set and no .env exists - the in-app Buy button will fall back to the product page."
}

Write-Host "Building Perpetua with Polar activation enabled (org $env:POLAR_ORGANIZATION_ID)..."
Write-Host "Working directory: $(Get-Location)"

if (-not (Test-Path -LiteralPath "package.json")) {
    throw "Run this script from the desktop/ directory (package.json not found)."
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

    # Ask the built binary whether Polar activation actually made it in. A
    # DISABLED answer here means the installer would sell keys it can't redeem.
    $configOutput = & $exePath config 2>&1 | Out-String
    Write-Host $configOutput.Trim()
    if ($configOutput -notmatch "Polar activation: ENABLED") {
        throw "Built binary reports Polar activation DISABLED - refusing to treat this as a release build."
    }
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

# Publish-ready checksums (non-fatal: a failure here must not fail a good build).
# Signing, when configured via PERPETUA_* env vars, already happened inside
# `tauri build` (bundle.windows.signCommand -> scripts\Sign-Windows.ps1), so
# these hashes cover the final, signed bytes. See docs\SIGNING-AND-STORE.md.
try {
    & (Join-Path $PSScriptRoot "scripts\Write-Checksums.ps1") -ReleaseDir $releaseDir -ShowSignature
} catch {
    Write-Warning "Checksum generation skipped: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Next: smoke-test per docs/RELEASE.md (register -> 3 licenses -> paywall -> activate -> keep-alive)."
