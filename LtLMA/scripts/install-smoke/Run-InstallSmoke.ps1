<#
.SYNOPSIS
  Silent install -> launch -> health -> uninstall smoke for the Perpetua MSI or NSIS installer.

.DESCRIPTION
  RUN THIS ONLY INSIDE A DISPOSABLE CLEAN MACHINE (Windows Sandbox, Hyper-V checkpoint VM, or
  a throwaway physical box). It really installs system-wide and really uninstalls. It refuses
  to run unless -IUnderstandThisInstalls is passed, as a guard against running on a dev host.

  Works under Windows PowerShell 5.1 (the default in Windows Sandbox) and PowerShell 7.
  Must run elevated (the MSI is per-machine, ALLUSERS=1). Windows Sandbox's default user is admin.

  Writes a transcript, an MSI verbose log, and results.json + results.md into -LogDir.
  Exit code: 0 = all checks passed (WARN allowed), 1 = at least one FAIL.

.PARAMETER Installer
  Path to Perpetua_1.0.0_x64_en-US.msi or Perpetua_1.0.0_x64-setup.exe (NSIS).

.PARAMETER LogDir
  Where results are written (map a host folder here when using Windows Sandbox).

.PARAMETER SkipUninstall
  Leave the app installed after the run (to inspect by hand).

.NOTES
  Status of this script: Built. Static-checked on the author's host only. NOT yet run inside a
  clean machine. See LtLMA/docs/INSTALL_SMOKE.md.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Installer,
  [string]$LogDir = (Join-Path $env:TEMP 'perpetua-install-smoke'),
  [int]$Port = 18765,
  [int]$WindowTimeoutSec = 60,
  [switch]$SkipUninstall,
  [Parameter(Mandatory)][switch]$IUnderstandThisInstalls
)

$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Start-Transcript -Path (Join-Path $LogDir 'transcript.txt') -Force | Out-Null

$results = New-Object System.Collections.ArrayList
function Add-Result([string]$Step, [string]$Status, [string]$Detail) {
  # Status: PASS | FAIL | WARN | INFO
  [void]$results.Add([pscustomobject]@{ Step = $Step; Status = $Status; Detail = $Detail })
  Write-Host ("[{0}] {1} - {2}" -f $Status, $Step, $Detail)
}

function Get-PerpetuaUninstallEntry {
  $roots = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
           'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
           'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
  foreach ($r in $roots) {
    if (-not (Test-Path $r)) { continue }
    foreach ($k in Get-ChildItem $r -ErrorAction SilentlyContinue) {
      $p = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
      if ($p.DisplayName -eq 'Perpetua') { return $p }
    }
  }
  return $null
}

function Test-Health([int]$p) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$p/api/health" -TimeoutSec 3
    return ($r.success -eq $true -and $r.data.status -eq 'ok')
  } catch { return $false }
}

$ext = [IO.Path]::GetExtension($Installer).ToLowerInvariant()
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$sw = [Diagnostics.Stopwatch]::StartNew()

try {
  # ---- 0. Environment -------------------------------------------------------------------
  $os = (Get-CimInstance Win32_OperatingSystem)
  Add-Result 'env.os' 'INFO' ("{0} build {1}" -f $os.Caption, $os.BuildNumber)
  Add-Result 'env.admin' ($(if ($isAdmin) { 'PASS' } else { 'FAIL' })) "elevated=$isAdmin"
  if (-not $isAdmin) { throw 'Not elevated; per-machine MSI cannot install.' }
  if (-not (Test-Path -LiteralPath $Installer)) { throw "Installer not found: $Installer" }
  $Installer = (Resolve-Path -LiteralPath $Installer).Path
  Add-Result 'installer.sha256' 'INFO' ("{0}  {1}" -f (Get-FileHash $Installer -Algorithm SHA256).Hash, $Installer)
  $sig = Get-AuthenticodeSignature $Installer
  Add-Result 'installer.signature' 'INFO' "Authenticode=$($sig.Status) (expected NotSigned for the unsigned MVP)"

  $wv2 = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue
  Add-Result 'env.webview2_preinstalled' 'INFO' $(if ($wv2) { "yes, $($wv2.pv)" } else { 'no (MSI will try to download the bootstrapper; needs network)' })

  # ---- 1. Clean-state preconditions ---------------------------------------------------
  $pre = Get-PerpetuaUninstallEntry
  Add-Result 'pre.not_installed' ($(if ($pre) { 'FAIL' } else { 'PASS' })) $(if ($pre) { "already installed v$($pre.DisplayVersion)" } else { 'no Perpetua uninstall entry' })
  $busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  Add-Result 'pre.port_free' ($(if ($busy) { 'FAIL' } else { 'PASS' })) "port $Port listening=$([bool]$busy)"
  $dataDir = Join-Path $env:APPDATA 'perpetua'
  Add-Result 'pre.no_user_data' ($(if (Test-Path $dataDir) { 'WARN' } else { 'PASS' })) "$dataDir exists=$(Test-Path $dataDir)"

  # ---- 2. Silent install ------------------------------------------------------------------
  $installSw = [Diagnostics.Stopwatch]::StartNew()
  if ($ext -eq '.msi') {
    $msiLog = Join-Path $LogDir 'msi-install.log'
    $args = @('/i', "`"$Installer`"", '/qn', '/norestart', '/l*v', "`"$msiLog`"")
    $proc = Start-Process msiexec.exe -ArgumentList $args -Wait -PassThru
  } elseif ($ext -eq '.exe') {
    $proc = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru   # Tauri NSIS silent switch
  } else { throw "Unsupported installer type: $ext" }
  $installSw.Stop()
  $okCodes = 0, 3010
  Add-Result 'install.exit_code' ($(if ($okCodes -contains $proc.ExitCode) { 'PASS' } else { 'FAIL' })) "exit=$($proc.ExitCode) in $([int]$installSw.Elapsed.TotalSeconds)s"

  # ---- 3. Post-install artefacts ---------------------------------------------------------
  Start-Sleep -Seconds 2
  $entry = Get-PerpetuaUninstallEntry
  Add-Result 'install.arp_entry' ($(if ($entry) { 'PASS' } else { 'FAIL' })) $(if ($entry) { "DisplayVersion=$($entry.DisplayVersion) Publisher=$($entry.Publisher) Loc=$($entry.InstallLocation)" } else { 'no Add/Remove Programs entry' })

  $installDir = $null
  if ($entry -and $entry.InstallLocation) { $installDir = $entry.InstallLocation.TrimEnd('\') }
  if (-not $installDir -or -not (Test-Path $installDir)) {
    foreach ($c in "$env:ProgramFiles\Perpetua", "$env:LOCALAPPDATA\Perpetua", "$env:LOCALAPPDATA\Programs\Perpetua") { if (Test-Path $c) { $installDir = $c; break } }
  }
  $exe = if ($installDir) { Join-Path $installDir 'perpetua.exe' } else { $null }
  $exeOk = $exe -and (Test-Path $exe)
  Add-Result 'install.exe_present' ($(if ($exeOk) { 'PASS' } else { 'FAIL' })) "$exe"
  if ($exeOk) {
    $vi = (Get-Item $exe).VersionInfo
    Add-Result 'install.exe_sha256' 'INFO' ((Get-FileHash $exe -Algorithm SHA256).Hash)
    Add-Result 'install.exe_version' ($(if ($vi.FileVersion -like '1.0.0*') { 'PASS' } else { 'WARN' })) "FileVersion=$($vi.FileVersion) Product=$($vi.ProductName) Company=$($vi.CompanyName)"
  } else { throw 'perpetua.exe missing after install; cannot continue.' }

  $lnkDirs = @(
    @{ N = 'startmenu_shortcut'; P = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Perpetua\Perpetua.lnk"; Alt = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Perpetua.lnk" },
    @{ N = 'desktop_shortcut';   P = "$env:PUBLIC\Desktop\Perpetua.lnk"; Alt = "$([Environment]::GetFolderPath('Desktop'))\Perpetua.lnk" }
  )
  foreach ($l in $lnkDirs) {
    $found = (Test-Path $l.P) -or (Test-Path $l.Alt)
    Add-Result "install.$($l.N)" ($(if ($found) { 'PASS' } else { 'WARN' })) "checked $($l.P) | $($l.Alt)"
  }

  # ---- 4. Launch, window, API health --------------------------------------------------
  $app = Start-Process -FilePath $exe -PassThru
  Add-Result 'launch.started' 'INFO' "pid=$($app.Id)"
  $win = $null
  $deadline = (Get-Date).AddSeconds($WindowTimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $pp = Get-Process -Id $app.Id -ErrorAction SilentlyContinue
    if (-not $pp) { break }
    if ($pp.MainWindowHandle -ne 0 -and $pp.MainWindowTitle) { $win = $pp; break }
    Start-Sleep -Milliseconds 500
  }
  if ($win) { Add-Result 'launch.window' ($(if ($win.MainWindowTitle -like 'Perpetua*') { 'PASS' } else { 'WARN' })) "title='$($win.MainWindowTitle)'" }
  else      { Add-Result 'launch.window' 'FAIL' "no main window within ${WindowTimeoutSec}s (process alive=$([bool](Get-Process -Id $app.Id -ErrorAction SilentlyContinue)))" }

  $healthy = $false
  for ($i = 0; $i -lt 30 -and -not $healthy; $i++) { $healthy = Test-Health $Port; if (-not $healthy) { Start-Sleep -Seconds 1 } }
  Add-Result 'launch.api_health' ($(if ($healthy) { 'PASS' } else { 'FAIL' })) "GET http://127.0.0.1:$Port/api/health"

  $lst = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($lst) { Add-Result 'launch.loopback_only' ($(if (($lst | Where-Object { $_.LocalAddress -ne '127.0.0.1' })) { 'FAIL' } else { 'PASS' })) "bound=$(($lst.LocalAddress | Sort-Object -Unique) -join ',')" }

  $wv = Get-Process msedgewebview2 -ErrorAction SilentlyContinue
  Add-Result 'launch.webview2_running' ($(if ($wv) { 'PASS' } else { 'WARN' })) "msedgewebview2 processes=$(@($wv).Count)"

  # API round-trip against the INSTALLED build: register -> 3 licenses OK -> 4th = 402 paywall.
  if ($healthy) {
    try {
      $pw = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 20 | ForEach-Object { [char]$_ }) + 'aA1!'
      $reg = Invoke-RestMethod "http://127.0.0.1:$Port/api/auth/register" -Method Post -ContentType 'application/json' `
              -Body (@{ email = 'smoke@example.test'; password = $pw } | ConvertTo-Json)
      $h = @{ Authorization = "Bearer $($reg.data.token)" }
      Add-Result 'api.register' ($(if ($reg.success) { 'PASS' } else { 'FAIL' })) "user id=$($reg.data.user.id)"
      $codes = @()
      1..4 | ForEach-Object {
        try { $r = Invoke-WebRequest "http://127.0.0.1:$Port/api/licenses" -Method Post -ContentType 'application/json' -Headers $h -UseBasicParsing `
                -Body (@{ product_name = "Smoke $_"; license_key = "SMOKE-$_" } | ConvertTo-Json); $codes += [int]$r.StatusCode }
        catch { $codes += [int]$_.Exception.Response.StatusCode }
      }
      Add-Result 'api.paywall_4th_is_402' ($(if (($codes -join ',') -eq '201,201,201,402') { 'PASS' } else { 'FAIL' })) "status codes: $($codes -join ',')"
    } catch { Add-Result 'api.roundtrip' 'FAIL' $_.Exception.Message }
  }

  # Autostart side effect: main.rs enables autolaunch on every start.
  $run = Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
  $runVal = $run.PSObject.Properties | Where-Object { $_.Value -like '*perpetua*' } | Select-Object -First 1
  Add-Result 'launch.autostart_run_key' 'INFO' $(if ($runVal) { "HKCU Run: $($runVal.Name) = $($runVal.Value)" } else { 'no HKCU Run entry found' })

  # Close-to-tray behaviour: CloseMainWindow should HIDE, not exit (main.rs on_window_event).
  if ($win) {
    [void]$win.CloseMainWindow(); Start-Sleep -Seconds 3
    $alive = [bool](Get-Process -Id $app.Id -ErrorAction SilentlyContinue)
    Add-Result 'launch.close_hides_to_tray' ($(if ($alive -and (Test-Health $Port)) { 'PASS' } else { 'FAIL' })) "process alive after window close=$alive"
  }

  # ---- 5. Stop app, uninstall -----------------------------------------------------------
  Get-Process perpetua -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
  if ($SkipUninstall) {
    Add-Result 'uninstall' 'INFO' 'skipped by -SkipUninstall'
  } else {
    if ($ext -eq '.msi') {
      $u = Start-Process msiexec.exe -ArgumentList @('/x', "`"$Installer`"", '/qn', '/norestart', '/l*v', "`"$(Join-Path $LogDir 'msi-uninstall.log')`"") -Wait -PassThru
    } else {
      $un = Get-ChildItem $installDir -Filter 'uninstall*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($un) { $u = Start-Process $un.FullName -ArgumentList '/S' -Wait -PassThru } else { $u = $null }
    }
    if ($u) { Add-Result 'uninstall.exit_code' ($(if ($okCodes -contains $u.ExitCode) { 'PASS' } else { 'FAIL' })) "exit=$($u.ExitCode)" }
    else    { Add-Result 'uninstall.exit_code' 'FAIL' 'no uninstaller found' }
    Start-Sleep -Seconds 3
    Add-Result 'uninstall.arp_removed'  ($(if (Get-PerpetuaUninstallEntry) { 'FAIL' } else { 'PASS' })) 'Add/Remove Programs entry gone'
    Add-Result 'uninstall.files_removed' ($(if (Test-Path $exe) { 'FAIL' } else { 'PASS' })) "$exe exists=$(Test-Path $exe)"
    Add-Result 'uninstall.shortcuts_removed' ($(if ((Test-Path $lnkDirs[0].P) -or (Test-Path $lnkDirs[1].P)) { 'FAIL' } else { 'PASS' })) 'Start Menu / Public Desktop shortcuts gone'
    Add-Result 'uninstall.port_released' ($(if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { 'FAIL' } else { 'PASS' })) "port $Port"
    $run2 = Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
    $left = $run2.PSObject.Properties | Where-Object { $_.Value -like '*perpetua*' }
    Add-Result 'uninstall.autostart_leftover' ($(if ($left) { 'WARN' } else { 'PASS' })) $(if ($left) { 'HKCU Run entry survives uninstall (dangling autostart) - file as a bug if so' } else { 'no leftover Run entry' })
    Add-Result 'uninstall.user_data_kept' 'INFO' "$dataDir exists=$(Test-Path $dataDir) (keeping the vault on uninstall is the expected/safe behaviour)"
  }
} catch {
  Add-Result 'fatal' 'FAIL' $_.Exception.Message
} finally {
  $sw.Stop()
  $fails = @($results | Where-Object Status -eq 'FAIL').Count
  $warns = @($results | Where-Object Status -eq 'WARN').Count
  $results | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $LogDir 'results.json') -Encoding UTF8
  $md = @("# Perpetua install smoke", "", "Installer: ``$Installer``  ", "Total time: $([int]$sw.Elapsed.TotalSeconds)s  | FAIL=$fails WARN=$warns", "", "| Status | Step | Detail |", "|---|---|---|")
  $md += $results | ForEach-Object { "| $($_.Status) | $($_.Step) | $(($_.Detail -replace '\|','/')) |" }
  $md | Set-Content -Path (Join-Path $LogDir 'results.md') -Encoding UTF8
  Write-Host "`nSUMMARY: FAIL=$fails WARN=$warns  (logs: $LogDir)"
  Stop-Transcript | Out-Null
  exit ($(if ($fails -gt 0) { 1 } else { 0 }))
}
