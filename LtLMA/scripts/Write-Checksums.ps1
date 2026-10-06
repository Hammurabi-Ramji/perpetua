<#
.SYNOPSIS
  Writes SHA256SUMS.txt for the Perpetua Windows release artifacts.

.DESCRIPTION
  Hashes (read-only) perpetua.exe, bundle\msi\*.msi and bundle\nsis\*.exe and
  writes a GNU coreutils "sha256sum" compatible file (lowercase hash, space,
  asterisk, file name; LF line endings; UTF-8 without BOM). Publish this file
  next to the download so users can verify what they fetched.

  Run it AFTER signing: Authenticode signing changes the bytes of the file,
  so hashes taken before signing will not match the shipped installer.

  Works on unsigned builds. No certificate, key or secret is needed.

.PARAMETER ReleaseDir
  Cargo release directory. Default: ..\src-tauri\target\release relative to
  this script (i.e. LtLMA\src-tauri\target\release).

.PARAMETER OutFile
  Output path. Default: <ReleaseDir>\bundle\SHA256SUMS.txt

.PARAMETER ShowSignature
  Also print the Authenticode status of each file (informational only).

.PARAMETER Verify
  Instead of writing, verify the files next to an existing SHA256SUMS.txt
  (-OutFile) against it. Exit code 1 on any mismatch/missing file.

.EXAMPLE
  .\scripts\Write-Checksums.ps1
  .\scripts\Write-Checksums.ps1 -ShowSignature
  .\scripts\Write-Checksums.ps1 -Verify -OutFile C:\dl\SHA256SUMS.txt
#>
[CmdletBinding()]
param(
    [string]$ReleaseDir,
    [string]$OutFile,
    [switch]$ShowSignature,
    [switch]$Verify
)

$ErrorActionPreference = "Stop"

if (-not $ReleaseDir) {
    $ReleaseDir = Join-Path $PSScriptRoot "..\src-tauri\target\release"
}
if (-not (Test-Path -LiteralPath $ReleaseDir)) {
    throw "Release directory not found: $ReleaseDir"
}
$ReleaseDir = (Resolve-Path -LiteralPath $ReleaseDir).Path
$bundleDir  = Join-Path $ReleaseDir "bundle"
if (-not $OutFile) { $OutFile = Join-Path $bundleDir "SHA256SUMS.txt" }

if ($Verify) {
    if (-not (Test-Path -LiteralPath $OutFile)) { throw "Checksum file not found: $OutFile" }
    $baseDir = Split-Path -Parent (Resolve-Path -LiteralPath $OutFile).Path
    $failed = 0
    foreach ($line in (Get-Content -LiteralPath $OutFile)) {
        if ($line -notmatch '^([0-9a-fA-F]{64}) [ *](.+)$') { continue }
        $want = $Matches[1].ToLowerInvariant(); $name = $Matches[2]
        # Look under the sums file's folder (bundle\msi, bundle\nsis, or a flat download folder),
        # plus its parent (perpetua.exe sits in release\, one level above bundle\).
        $cands = @(Get-ChildItem -LiteralPath $baseDir -Recurse -File -Filter $name -ErrorAction SilentlyContinue)
        $parent = Split-Path -Parent $baseDir
        if ($parent -and (Split-Path -Leaf $baseDir) -eq "bundle") {
            $cands += @(Get-ChildItem -LiteralPath $parent -File -Filter $name -ErrorAction SilentlyContinue)
        }
        if ($cands.Count -eq 0) { Write-Host "MISSING  $name"; $failed++; continue }
        $ok = $false
        foreach ($c in $cands) {
            if ((Get-FileHash -LiteralPath $c.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -eq $want) { $ok = $true; break }
        }
        if ($ok) { Write-Host "OK       $name" } else { Write-Host "MISMATCH $name"; $failed++ }
    }
    if ($failed -gt 0) { Write-Error "$failed file(s) failed verification."; exit 1 }
    exit 0
}

$files = @()
$exe = Join-Path $ReleaseDir "perpetua.exe"
if (Test-Path -LiteralPath $exe) { $files += Get-Item -LiteralPath $exe }
foreach ($sub in @("msi\*.msi", "nsis\*.exe")) {
    $files += @(Get-ChildItem -Path (Join-Path $bundleDir $sub) -File -ErrorAction SilentlyContinue)
}

if ($files.Count -eq 0) {
    throw "No artifacts found under $ReleaseDir (looked for perpetua.exe, bundle\msi\*.msi, bundle\nsis\*.exe). Run the build first."
}

$names = $files | ForEach-Object { $_.Name }
$dupes = $names | Group-Object | Where-Object Count -gt 1
if ($dupes) { throw "Duplicate file names would make SHA256SUMS ambiguous: $($dupes.Name -join ', ')" }

$sb = New-Object System.Text.StringBuilder
foreach ($f in ($files | Sort-Object Name)) {
    $h = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    [void]$sb.Append("$h *$($f.Name)`n")
    Write-Host ("{0}  {1}" -f $h, $f.FullName)
    if ($ShowSignature) {
        $sig = Get-AuthenticodeSignature -LiteralPath $f.FullName
        $who = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "-" }
        Write-Host ("    signature: {0} ({1})" -f $sig.Status, $who)
    }
}

$outDir = Split-Path -Parent $OutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
[System.IO.File]::WriteAllText($OutFile, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host "Wrote $OutFile ($($files.Count) file(s))"
Write-Host "Verify on Linux/macOS: sha256sum -c SHA256SUMS.txt   |   Windows: .\scripts\Write-Checksums.ps1 -Verify -OutFile <path>"
