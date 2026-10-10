<#
.SYNOPSIS
  Optional Authenticode signing hook for Tauri (bundle.windows.signCommand).

.DESCRIPTION
  Tauri calls this once per binary/installer with the file path. It is a
  NO-OP (exit 0, with a one-line notice) unless a signing method is configured
  through environment variables, so unsigned builds keep working. No
  certificate or secret lives in the repo.

  Methods (first one configured wins):

  1. Azure Trusted Signing (recommended, no hardware token)
       PERPETUA_AZURE_SIGNING_ENDPOINT   e.g. https://eus.codesigning.azure.net
       PERPETUA_AZURE_SIGNING_ACCOUNT    Trusted Signing account name
       PERPETUA_AZURE_SIGNING_PROFILE    certificate profile name
       AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET
                                         service principal (read by the CLI)
     Needs `trusted-signing-cli` on PATH: cargo install trusted-signing-cli

  2. Certificate in the Windows cert store (OV/EV; EV token / HSM / self-hosted runner)
       PERPETUA_SIGN_CERT_THUMBPRINT     SHA1 thumbprint
       PERPETUA_SIGN_TIMESTAMP_URL       optional (default http://timestamp.digicert.com)

  3. PFX file (OV cert exported to a file; mainly for CI)
       PERPETUA_SIGN_PFX_PATH            path to .pfx, OR
       PERPETUA_SIGN_PFX_BASE64          base64 of the .pfx (decoded to a temp file, deleted after)
       PERPETUA_SIGN_PFX_PASSWORD        pfx password
       PERPETUA_SIGN_TIMESTAMP_URL       optional

  Other:
       PERPETUA_REQUIRE_SIGNING=1        fail (exit 1) instead of no-op when nothing is configured
                                         (use in release CI so an unsigned build can never ship silently)
       PERPETUA_SIGN_SIGNTOOL            explicit path to signtool.exe

  Secrets are never printed. Note that signtool receives the PFX password on
  its command line (visible to local processes for the duration of the call);
  prefer the cert-store or Azure methods on shared machines.

.PARAMETER Path
  File to sign (Tauri substitutes %1).
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Path
)

$ErrorActionPreference = "Stop"

function Test-Env([string]$Name) { return -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name)) }
function Get-Env([string]$Name)  { return [Environment]::GetEnvironmentVariable($Name) }

if (-not $Path) { throw "Sign-Windows.ps1: no file path argument supplied." }
if (-not (Test-Path -LiteralPath $Path)) { throw "Sign-Windows.ps1: file not found: $Path" }

$azure = (Test-Env "PERPETUA_AZURE_SIGNING_ENDPOINT") -and (Test-Env "PERPETUA_AZURE_SIGNING_ACCOUNT") -and (Test-Env "PERPETUA_AZURE_SIGNING_PROFILE")
$thumb = Test-Env "PERPETUA_SIGN_CERT_THUMBPRINT"
$pfx   = ((Test-Env "PERPETUA_SIGN_PFX_PATH") -or (Test-Env "PERPETUA_SIGN_PFX_BASE64")) -and (Test-Env "PERPETUA_SIGN_PFX_PASSWORD")

if (-not ($azure -or $thumb -or $pfx)) {
    if ((Get-Env "PERPETUA_REQUIRE_SIGNING") -eq "1") {
        Write-Error "PERPETUA_REQUIRE_SIGNING=1 but no signing method is configured (see scripts/Sign-Windows.ps1). Refusing to produce an unsigned build."
        exit 1
    }
    Write-Host "[sign] No signing env configured - leaving unsigned: $(Split-Path -Leaf $Path)"
    exit 0
}

function Find-SignTool {
    if (Test-Env "PERPETUA_SIGN_SIGNTOOL") { return (Get-Env "PERPETUA_SIGN_SIGNTOOL") }
    $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $kits = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
    if (Test-Path -LiteralPath $kits) {
        $c = Get-ChildItem -Path $kits -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '\\x64\\' } |
            Sort-Object FullName -Descending | Select-Object -First 1
        if ($c) { return $c.FullName }
    }
    throw "signtool.exe not found. Install the Windows SDK or set PERPETUA_SIGN_SIGNTOOL."
}

$leaf = Split-Path -Leaf $Path
$tmpPfx = $null
try {
    if ($azure) {
        $cli = Get-Command trusted-signing-cli -ErrorAction SilentlyContinue
        if (-not $cli) { throw "trusted-signing-cli not found on PATH (cargo install trusted-signing-cli)." }
        Write-Host "[sign] Azure Trusted Signing: $leaf"
        & $cli.Source -e (Get-Env "PERPETUA_AZURE_SIGNING_ENDPOINT") -a (Get-Env "PERPETUA_AZURE_SIGNING_ACCOUNT") `
            -c (Get-Env "PERPETUA_AZURE_SIGNING_PROFILE") -d "Perpetua" $Path
        if ($LASTEXITCODE -ne 0) { throw "trusted-signing-cli failed ($LASTEXITCODE) for $leaf" }
    }
    else {
        $signtool = Find-SignTool
        $ts = if (Test-Env "PERPETUA_SIGN_TIMESTAMP_URL") { Get-Env "PERPETUA_SIGN_TIMESTAMP_URL" } else { "http://timestamp.digicert.com" }
        $signArgs = @("sign", "/fd", "SHA256", "/td", "SHA256", "/tr", $ts, "/d", "Perpetua")
        if ($thumb) {
            Write-Host "[sign] signtool (cert store): $leaf"
            $signArgs += @("/sha1", (Get-Env "PERPETUA_SIGN_CERT_THUMBPRINT"))
        }
        else {
            Write-Host "[sign] signtool (PFX): $leaf"
            $pfxPath = Get-Env "PERPETUA_SIGN_PFX_PATH"
            if (-not (Test-Env "PERPETUA_SIGN_PFX_PATH")) {
                $tmpPfx = Join-Path ([System.IO.Path]::GetTempPath()) ("perpetua-sign-" + [guid]::NewGuid().ToString("N") + ".pfx")
                [System.IO.File]::WriteAllBytes($tmpPfx, [Convert]::FromBase64String((Get-Env "PERPETUA_SIGN_PFX_BASE64")))
                $pfxPath = $tmpPfx
            }
            $signArgs += @("/f", $pfxPath, "/p", (Get-Env "PERPETUA_SIGN_PFX_PASSWORD"))
        }
        $signArgs += $Path
        & $signtool @signArgs
        if ($LASTEXITCODE -ne 0) { throw "signtool failed ($LASTEXITCODE) for $leaf" }
    }
}
finally {
    if ($tmpPfx -and (Test-Path -LiteralPath $tmpPfx)) { Remove-Item -LiteralPath $tmpPfx -Force -ErrorAction SilentlyContinue }
}
