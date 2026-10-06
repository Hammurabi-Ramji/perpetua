<#
.SYNOPSIS
  Builds a *debug* `perpetua` binary with Polar activation baked in for the
  purchase -> activate dry-run (polar-webhook/dryrun). Never ships to customers.

.PARAMETER Mode
  mock    (default) POLAR_API_BASE=http://127.0.0.1:<MockPort>; org id org_dryrun_local
  sandbox POLAR_API_BASE=https://sandbox-api.polar.sh; requires -OrganizationId
          (the sandbox org id from the Polar sandbox dashboard; public, not a secret)

.NOTES
  Output goes to src-tauri\target\polar-dryrun (kept separate so the offline
  binary used by the Playwright e2e is not clobbered). If cargo refuses because
  a parent directory contains a stray [workspace] Cargo.toml (e.g. C:\IEDB\Cargo.toml),
  the source is mirrored to a temp dir (outside that tree) and built there.
  Prints the binary path; export it as PERPETUA_BIN.
#>
param(
  [ValidateSet('mock', 'sandbox')][string]$Mode = 'mock',
  [int]$MockPort = 8799,
  [string]$OrganizationId = ''
)
$ErrorActionPreference = 'Stop'
$src = Resolve-Path (Join-Path $PSScriptRoot '..\src-tauri')
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path $cargoBin) { $env:PATH += ";$cargoBin" }

if ($Mode -eq 'mock') {
  $env:POLAR_API_BASE = "http://127.0.0.1:$MockPort"
  $env:POLAR_ORGANIZATION_ID = if ($OrganizationId) { $OrganizationId } else { 'org_dryrun_local' }
} else {
  if (-not $OrganizationId) { throw '-OrganizationId is required in sandbox mode' }
  $env:POLAR_API_BASE = 'https://sandbox-api.polar.sh'
  $env:POLAR_ORGANIZATION_ID = $OrganizationId
}
Write-Host "Mode=$Mode  POLAR_API_BASE=$env:POLAR_API_BASE  org=$env:POLAR_ORGANIZATION_ID"

function Build([string]$dir, [string]$targetDir) {
  Push-Location $dir
  try {
    $env:CARGO_TARGET_DIR = $targetDir
    cargo build --bin perpetua 2>&1 | Tee-Object -Variable out | Out-Host
    return @{ ok = ($LASTEXITCODE -eq 0); out = ($out -join "`n") }
  } finally { Pop-Location }
}

$target = Join-Path $src 'target\polar-dryrun'
$r = Build $src $target
if (-not $r.ok) {
  if ($r.out -notmatch "believes it's in a workspace") { throw 'cargo build failed' }
  Write-Host 'Parent [workspace] detected; building from a mirror outside that tree...'
  $mirror = Join-Path $env:TEMP 'perpetua-polar-dryrun-src'
  $mirrorTauri = Join-Path $mirror 'desktop\src-tauri'
  New-Item -ItemType Directory -Force $mirrorTauri | Out-Null
  robocopy $src $mirrorTauri /E /XD target /NFL /NDL /NJH /NJS | Out-Null
  $buildDir = Join-Path (Split-Path $src -Parent) 'build'
  if (Test-Path $buildDir) { robocopy $buildDir (Join-Path $mirror 'desktop\build') /E /NFL /NDL /NJH /NJS | Out-Null }
  $target = Join-Path $mirror 'target'
  $r = Build $mirrorTauri $target
  if (-not $r.ok) { throw 'cargo build failed (mirror)' }
}

$bin = Join-Path $target 'debug\perpetua.exe'
& $bin config
Write-Host "`nPERPETUA_BIN=$bin"
