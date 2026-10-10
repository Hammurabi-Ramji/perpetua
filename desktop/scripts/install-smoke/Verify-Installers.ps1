<#
.SYNOPSIS
  Host-safe static verification of the Perpetua installers. Installs NOTHING on this machine.

.DESCRIPTION
  - Locates MSI / NSIS artifacts under src-tauri\target\release\bundle
  - SHA256, size, Authenticode status
  - Reads MSI Property / Shortcut / Directory / CustomAction / Feature tables (read-only COM)
  - Extracts the MSI payload to a scratch dir with an ADMINISTRATIVE image (msiexec /a: just copies
    files, no registry/shortcut/ARP changes), hashes the embedded perpetua.exe and checks its version
  - Runs the extracted exe headless on a NON-default port against a scratch data dir:
      `perpetua config`, `perpetua serve <scratch>` + /api/health, register, 3 licenses OK, 4th = 402
    (never touches %APPDATA%\perpetua or port 18765)
  - Prints the silent-install command lines for the human/VM run

  Status: Built and run once on the authoring host 2026-10-06 (results in docs/INSTALL_SMOKE.md).
#>
[CmdletBinding()]
param(
  [string]$BundleDir = (Join-Path $PSScriptRoot '..\..\src-tauri\target\release\bundle'),
  [string]$Scratch = (Join-Path $env:TEMP 'perpetua-verify-installers'),
  [int]$Port = 18799
)
$ErrorActionPreference = 'Stop'
$BundleDir = (Resolve-Path -LiteralPath $BundleDir).Path
function Row($k, $v) { '{0,-28} {1}' -f $k, $v }

$installers = Get-ChildItem $BundleDir -Recurse -Include *.msi, *.exe -File -ErrorAction SilentlyContinue
if (-not $installers) { throw "No installers under $BundleDir - run .\build-release.ps1 first." }
if (-not ($installers | Where-Object Extension -eq '.exe')) { Write-Warning 'No NSIS setup.exe found (bundle\nsis missing) - only MSI can be verified.' }

foreach ($f in $installers) {
  "`n=== $($f.FullName)"
  Row 'Size (bytes)' $f.Length
  Row 'Modified' $f.LastWriteTime
  Row 'SHA256' (Get-FileHash $f.FullName -Algorithm SHA256).Hash
  Row 'Authenticode' (Get-AuthenticodeSignature $f.FullName).Status
  if ($f.Extension -eq '.exe') { Row 'Silent install' "`"$($f.FullName)`" /S      (Tauri NSIS; uninstall: <InstallDir>\uninstall.exe /S)" }
  if ($f.Extension -ne '.msi') { continue }

  Row 'Silent install' "msiexec /i `"$($f.FullName)`" /qn /norestart /l*v install.log"
  Row 'Silent uninstall' "msiexec /x `"$($f.FullName)`" /qn /norestart /l*v uninstall.log"

  $wi = New-Object -ComObject WindowsInstaller.Installer
  $db = $wi.GetType().InvokeMember('OpenDatabase', 'InvokeMethod', $null, $wi, @($f.FullName, 0))
  function Q($sql) {
    try {
      $v = $db.GetType().InvokeMember('OpenView', 'InvokeMethod', $null, $db, @($sql))
      [void]$v.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $v, $null)
      while ($r = $v.GetType().InvokeMember('Fetch', 'InvokeMethod', $null, $v, $null)) {
        $n = $r.GetType().InvokeMember('FieldCount', 'GetProperty', $null, $r, $null)
        '  ' + ((1..$n | ForEach-Object { $r.GetType().InvokeMember('StringData', 'GetProperty', $null, $r, $_) }) -join ' | ')
      }
    } catch { '  (table absent)' }
  }
  "--- MSI Property";      Q 'SELECT Property,Value FROM Property'
  "--- MSI Shortcut";      Q 'SELECT Shortcut,Directory_,Name,Target FROM Shortcut'
  "--- MSI Directory";     Q 'SELECT Directory,Directory_Parent,DefaultDir FROM Directory'
  "--- MSI CustomAction";  Q 'SELECT Action,Type,Source,Target FROM CustomAction'
  "--- MSI Feature";       Q 'SELECT Feature,Title,Level FROM Feature'
  "--- MSI Registry";      Q 'SELECT `Root`,`Key`,`Name`,`Value` FROM `Registry`'

  # Administrative image: copies payload only, does not install.
  $x = Join-Path $Scratch 'admin-extract'
  if (Test-Path $x) { Remove-Item $x -Recurse -Force }
  New-Item -ItemType Directory -Force $x | Out-Null
  $p = Start-Process msiexec.exe -ArgumentList "/a `"$($f.FullName)`" /qn TARGETDIR=`"$x`"" -Wait -PassThru
  Row 'Admin extract exit' $p.ExitCode
  $exe = Get-ChildItem $x -Recurse -Filter perpetua.exe | Select-Object -First 1
  if (-not $exe) { throw 'perpetua.exe not found in MSI payload' }
  "--- Embedded perpetua.exe"
  Row 'SHA256' (Get-FileHash $exe.FullName -Algorithm SHA256).Hash
  Row 'Size (bytes)' $exe.Length
  $vi = $exe.VersionInfo
  Row 'Version/Product/Company' "$($vi.FileVersion) / $($vi.ProductName) / $($vi.CompanyName)"
  Row 'Authenticode' (Get-AuthenticodeSignature $exe.FullName).Status
  $cfgOut = Join-Path $Scratch 'config.out.txt'
  Start-Process $exe.FullName -ArgumentList 'config' -Wait -RedirectStandardOutput $cfgOut -WindowStyle Hidden
  Row '`config`' ((Get-Content $cfgOut -Raw).Trim())

  # Headless run on a scratch port + scratch data dir.
  $data = Join-Path $Scratch 'data'
  if (Test-Path $data) { Remove-Item $data -Recurse -Force }
  New-Item -ItemType Directory -Force $data | Out-Null
  $env:PERPETUA_API_PORT = "$Port"
  $srv = Start-Process $exe.FullName -ArgumentList 'serve', "`"$data`"" -PassThru -WindowStyle Hidden
  try {
    $ok = $false
    1..20 | ForEach-Object { if (-not $ok) { try { $ok = (Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2).data.status -eq 'ok' } catch { Start-Sleep 1 } } }
    Row 'serve /api/health' $(if ($ok) { 'ok' } else { 'FAILED' })
    if ($ok) {
      $pw = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 20 | ForEach-Object { [char]$_ }) + 'aA1!'
      $reg = Invoke-RestMethod "http://127.0.0.1:$Port/api/auth/register" -Method Post -ContentType 'application/json' -Body (@{ email = 'smoke@example.test'; password = $pw } | ConvertTo-Json)
      $h = @{ Authorization = "Bearer $($reg.data.token)" }
      $codes = 1..4 | ForEach-Object {
        try { [int](Invoke-WebRequest "http://127.0.0.1:$Port/api/licenses" -Method Post -ContentType 'application/json' -Headers $h -UseBasicParsing -Body (@{ product_name = "S$_"; license_key = "K-$_" } | ConvertTo-Json)).StatusCode }
        catch { [int]$_.Exception.Response.StatusCode }
      }
      Row 'license POST x4 (want 201,201,201,402)' ($codes -join ',')
    }
  } finally {
    Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
    Remove-Item Env:PERPETUA_API_PORT -ErrorAction SilentlyContinue
  }
}
"`nScratch dir (safe to delete): $Scratch"

