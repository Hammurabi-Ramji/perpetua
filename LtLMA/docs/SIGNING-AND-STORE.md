# Perpetua - Code signing, checksums and Microsoft Store

Status: the repo is **signing-ready but unsigned**. No certificate, key or
secret is stored in git. Everything below is wired so that setting a few
environment variables (locally or as GitHub Actions secrets) produces signed
installers, and leaving them unset produces the same unsigned build as before.

Pricing, eligibility and portal names in the "Options" section change often.
They are stated from memory of Microsoft/CA documentation and must be
re-checked before you pay for anything.

## What is in the repo

| Piece | Where | Behaviour |
|-------|-------|-----------|
| Signing hook | `src-tauri/tauri.conf.json` -> `bundle.windows.signCommand` | Tauri runs `powershell ... -File ../scripts/Sign-Windows.ps1 <file>` for each binary/installer it produces (Windows builds only; ignored on macOS/Linux). Path is relative to `src-tauri/`, which is the working directory `tauri build` uses. |
| Signing script | `scripts/Sign-Windows.ps1` | **No-op (exit 0) when no signing env vars are set.** Otherwise signs via Azure Trusted Signing, a cert-store thumbprint, or a PFX. `PERPETUA_REQUIRE_SIGNING=1` turns "nothing configured" into a hard failure (use in release CI). |
| Checksums | `scripts/Write-Checksums.ps1` | Writes `SHA256SUMS.txt` (sha256sum format) for `perpetua.exe`, `bundle\msi\*.msi`, `bundle\nsis\*.exe`. `-ShowSignature` prints Authenticode status; `-Verify` checks files against a sums file. Read-only on the installers. |
| Build hook | `build-release.ps1` | Calls `Write-Checksums.ps1 -ShowSignature` after the build. Non-fatal: a checksum failure only warns. |

Output: `src-tauri\target\release\bundle\SHA256SUMS.txt`. Always generate it
after signing (signing changes the bytes); `build-release.ps1` does, because
signing happens inside `tauri build`.

### Environment variables (all optional)

Pick **one** method. If several are set the order is Azure, then thumbprint,
then PFX.

| Method | Variables |
|--------|-----------|
| Azure Trusted Signing | `PERPETUA_AZURE_SIGNING_ENDPOINT`, `PERPETUA_AZURE_SIGNING_ACCOUNT`, `PERPETUA_AZURE_SIGNING_PROFILE`, plus `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`. Needs `trusted-signing-cli` on PATH (`cargo install trusted-signing-cli`). |
| Cert in Windows store (EV token, HSM, self-hosted runner) | `PERPETUA_SIGN_CERT_THUMBPRINT`; optional `PERPETUA_SIGN_TIMESTAMP_URL` (default `http://timestamp.digicert.com`). Needs `signtool.exe` (Windows SDK; found automatically under `Windows Kits\10\bin`, or set `PERPETUA_SIGN_SIGNTOOL`). |
| PFX file | `PERPETUA_SIGN_PFX_PATH` **or** `PERPETUA_SIGN_PFX_BASE64`, and `PERPETUA_SIGN_PFX_PASSWORD`; optional `PERPETUA_SIGN_TIMESTAMP_URL`. The base64 form is decoded to a temp file that is deleted afterwards. |
| Policy | `PERPETUA_REQUIRE_SIGNING=1` fails the build if no method is configured. |

Caveat on PFX: since mid-2023 the CA/Browser Forum baseline requires new
OV/EV code-signing keys to live on certified hardware or a cloud HSM, so a
freely exportable PFX is generally only available for older certificates. For
new certificates expect the thumbprint (token) or a CA/cloud-signing route
instead. signtool receives the PFX password on its command line; avoid the PFX
method on shared machines.

## Options compared

| | OV certificate | EV certificate | Azure Trusted Signing | Microsoft Store (MSIX) |
|---|---|---|---|---|
| Typical cost | roughly 200-400 USD/yr | roughly 300-600 USD/yr plus hardware token | roughly 10 USD/month (Basic tier) | one-time Partner Center fee (about 19 USD individual, about 99 USD company) |
| Identity vetting | organisation checked by CA, days | stricter, days to weeks | Microsoft identity validation; eligibility limited by country/legal-entity age (verify current rules) | Partner Center account validation |
| Key storage | hardware token / cloud HSM | hardware token / cloud HSM | Microsoft-managed; short-lived certs, you never hold a key | Microsoft signs the package on ingestion |
| CI friendliness | poor unless cloud-HSM or self-hosted runner | poor (token) | **good** (service principal, GitHub Action or CLI) | good (upload via Partner Center) |
| SmartScreen | reputation builds with downloads; warnings can persist at first | historically near-instant trust; Microsoft has reduced this advantage, so do not rely on it | Microsoft states trusted-signing identities are well treated; still verify on a clean machine | no SmartScreen prompt for Store installs |
| Fits existing MSI/NSIS pipeline | yes | yes | yes (this repo's `Sign-Windows.ps1`) | needs a separate MSIX build path (see below) |

Recommendation: **Azure Trusted Signing** if Hammurabi Coding Company, LLC
qualifies (cheapest, CI-native, no token). Fall back to an **OV/EV cert held in
a cloud HSM or token** if not. Treat the **Store** as an additional channel,
not a substitute, because the Store build needs real packaging work.

Signing is necessary but not sufficient for SmartScreen: reputation also
depends on download volume and age of the signing identity. Expect some
warnings in the first weeks even when signed.

## Human steps required (nothing here can be done from the repo)

### Path A - Azure Trusted Signing
1. Create or use an Azure subscription; register the `Microsoft.CodeSigning` resource provider.
2. Create a Trusted Signing account and complete **identity validation** for the legal entity (Hammurabi Coding Company, LLC). This can take days. Check eligibility first.
3. Create a **certificate profile** (Public Trust). Note the endpoint for your region (for example `https://eus.codesigning.azure.net`), account name and profile name.
4. Create an Entra app registration (service principal); give it the "Trusted Signing Certificate Profile Signer" role on the account. Create a client secret.
5. Add the GitHub secrets below.
6. Install `trusted-signing-cli` locally if you want to sign on your machine.
7. The certificate subject will be the validated legal entity name; make sure it is what you want users to see.

### Path B - OV/EV certificate
1. Buy from a CA; complete organisation vetting (D-U-N-S or equivalent registry listing helps).
2. Receive the token or enrol a cloud-HSM key; install the cert in the machine's store.
3. Get the SHA1 thumbprint: `Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Format-List Subject,Thumbprint,NotAfter`.
4. For local builds: `$env:PERPETUA_SIGN_CERT_THUMBPRINT = "<thumbprint>"` then `.\build-release.ps1` (insert the token and enter its PIN when prompted). For CI you need a self-hosted Windows runner with the token attached, or a CA cloud-signing service.

### Path C - Microsoft Store
See "Store packaging" below. Human steps: Partner Center registration, reserve the app name, collect the assigned Package/Identity name and Publisher ID, write the listing, privacy policy URL, age rating, and submit.

## GitHub Actions secrets

Names for `.github/workflows/release.yml` (workflow is **not** modified by
this change; add these to the Windows build step when you are ready).
Existing secrets: `PERPETUA_LICENSE_SECRET`, `POLAR_ORGANIZATION_ID`.

| Secret | Used for |
|--------|----------|
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | Azure Trusted Signing service principal |
| `PERPETUA_AZURE_SIGNING_ENDPOINT`, `PERPETUA_AZURE_SIGNING_ACCOUNT`, `PERPETUA_AZURE_SIGNING_PROFILE` | Azure Trusted Signing target (not secret, but convenient to keep as secrets/variables) |
| `PERPETUA_SIGN_PFX_BASE64`, `PERPETUA_SIGN_PFX_PASSWORD` | PFX path (only if you hold an exportable PFX) |
| `PERPETUA_SIGN_CERT_THUMBPRINT` | self-hosted runner with the cert installed |

Example for the Windows leg of the `build` job (sketch, not applied):

```yaml
      - name: Install trusted-signing-cli
        if: matrix.platform == 'windows-latest'
        run: cargo install trusted-signing-cli --locked

      - name: Build
        run: npm run tauri build
        env:
          POLAR_ORGANIZATION_ID: ${{ secrets.POLAR_ORGANIZATION_ID }}
          PERPETUA_LICENSE_SECRET: ${{ secrets.PERPETUA_LICENSE_SECRET }}
          PERPETUA_REQUIRE_SIGNING: ${{ matrix.platform == 'windows-latest' && '1' || '' }}
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
          AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
          PERPETUA_AZURE_SIGNING_ENDPOINT: ${{ secrets.PERPETUA_AZURE_SIGNING_ENDPOINT }}
          PERPETUA_AZURE_SIGNING_ACCOUNT: ${{ secrets.PERPETUA_AZURE_SIGNING_ACCOUNT }}
          PERPETUA_AZURE_SIGNING_PROFILE: ${{ secrets.PERPETUA_AZURE_SIGNING_PROFILE }}

      - name: Checksums (Windows)
        if: matrix.platform == 'windows-latest'
        shell: pwsh
        run: ./scripts/Write-Checksums.ps1 -ShowSignature
```

Add `LtLMA/src-tauri/target/release/bundle/SHA256SUMS.txt` to the "Stash
installers" artifact paths so the `publish` job attaches it to the release.
Keep `PERPETUA_REQUIRE_SIGNING` empty (or unset) until signing is actually
configured, otherwise the Windows job will (intentionally) fail. Secrets are
not available to workflows triggered by pull requests from forks, which is the
desired behaviour.

## Verifying a signed build

```powershell
# Authenticode status, signer, timestamp
Get-AuthenticodeSignature .\src-tauri\target\release\perpetua.exe,
  .\src-tauri\target\release\bundle\msi\*.msi,
  .\src-tauri\target\release\bundle\nsis\*.exe |
  Format-List Path,Status,StatusMessage,SignerCertificate,TimeStamperCertificate

# signtool (Windows SDK): verify chain to a trusted root, show details
signtool verify /pa /v .\src-tauri\target\release\bundle\msi\Perpetua_1.0.0_x64_en-US.msi

# Checksums
.\scripts\Write-Checksums.ps1 -ShowSignature          # (re)generate + show signature status
.\scripts\Write-Checksums.ps1 -Verify                 # verify built files against bundle\SHA256SUMS.txt
sha256sum -c SHA256SUMS.txt                           # end users on Linux/macOS/Git Bash
```

Expected: `Status : Valid`, the signer subject is the legal entity, and a
timestamper certificate is present (without a timestamp the signature stops
validating when the signing certificate expires). `NotSigned` means the env
vars were not set or the sign command was not applied.

Check that Tauri signed **all three** artifacts: the inner `perpetua.exe`
(shown in the MSI/NSIS payload and in `target\release`), the MSI, and the NSIS
setup. If the MSI or NSIS file reports `NotSigned` while `perpetua.exe` is
signed, run `scripts\Sign-Windows.ps1 <file>` on it manually and regenerate the
checksums. Always finish with a clean-machine download test to see the real
SmartScreen behaviour.

Publish `SHA256SUMS.txt` next to the download link; the hash of a signed file
differs from the unsigned one, so never reuse old sums.

## Microsoft Store packaging: requirements and gaps

Two Store routes exist; they have very different cost for this app.

1. **Win32 (MSI/EXE) submission.** Submit the existing signed installer by URL.
   Requirements: installer signed by a CA trusted by Microsoft (so this
   needs Path A or B first), silent-install switches declared (`/S` for NSIS,
   `/qn` for MSI), stable versioned HTTPS download URL, and it must install
   and uninstall cleanly. Least work, but Microsoft does not host or sign it.
2. **MSIX submission.** Microsoft signs the package for you (no cert purchase
   needed for Store-only distribution) and users get the Store install path.

Gaps for MSIX (all currently **unverified/not done**):

- **No MSIX target in `tauri build`.** `bundle.targets: "all"` yields MSI and NSIS only. An MSIX needs a separate `AppxManifest.xml`, a build with the Windows SDK `makeappx.exe` (or the MSIX Packaging Tool / a community Tauri MSIX tool), and a test-signed package for local sideload testing.
- **Identity values come from Partner Center**, not from `tauri.conf.json`: Package Identity Name and Publisher (`CN=...`) must match the reserved name exactly.
- **Bundle identifier `com.perpetua.app`.** Tauri prints a warning because an identifier ending in `.app` conflicts with the macOS app bundle extension. It is a warning only and does not block Windows builds or Store submission (MSIX identity is separate). Changing the identifier would move the app-data directory and break existing installs, so leave it unless you accept migrating data.
- **Store logos.** `src-tauri/icons/` already has `StoreLogo.png` and `Square*Logo.png`; confirm sizes against the manifest you write (44, 150, 310x150 wide if used) and prepare listing screenshots and a 300x300 style store icon.
- **WebView2.** Tauri's default install mode downloads a bootstrapper, which Store packages cannot rely on. Windows 11 ships the Evergreen runtime; for Windows 10 decide on a fixed runtime or a declared dependency.
- **Full-trust and local server.** The app runs a loopback API on `127.0.0.1:18765`. Packaged as a full-trust MSIX (`runFullTrust`) this works; an AppContainer-confined package would need loopback exemption. Plan on full trust.
- **Autostart and registry writes.** `tauri-plugin-autostart` writes a Run registry key, which MSIX virtualises or blocks. MSIX needs a `windows.startupTask` extension instead, with plugin changes.
- **Data location.** The vault lives under AppData; MSIX redirects writes into the package's virtualised store. Test upgrade, uninstall (data removal) and the secrets/keyring behaviour inside the package. Do not assume existing installs migrate.
- **Store policy review.** Perpetua sells Pro through Polar and offline keys. Confirm current Microsoft Store policy on third-party commerce / in-app purchases, plus the requirement for a public privacy policy URL (`legal/PRIVACY.md` content must be hosted), support contact (`legal/SUPPORT.md`), age rating and accurate capability declarations.
- **Cloud backup / SMTP / browser extension pairing** need disclosure in the privacy policy and Store listing.

Recommended order: Path A or B signing -> clean-machine SmartScreen test ->
publish signed installers with `SHA256SUMS.txt` -> only then consider the Store.

## Quick local checklists

Unsigned build (default, unchanged):

```powershell
$env:PERPETUA_LICENSE_SECRET = "<from your password manager>"
.\build-release.ps1          # signing hook is a no-op; SHA256SUMS.txt is still written
```

Signed build with a store certificate:

```powershell
$env:PERPETUA_LICENSE_SECRET = "<from your password manager>"
$env:PERPETUA_SIGN_CERT_THUMBPRINT = "<thumbprint>"
$env:PERPETUA_REQUIRE_SIGNING = "1"
.\build-release.ps1
```

Manually signing an already built installer (for example if Tauri skipped one):

```powershell
$env:PERPETUA_SIGN_CERT_THUMBPRINT = "<thumbprint>"
.\scripts\Sign-Windows.ps1 .\src-tauri\target\release\bundle\msi\Perpetua_1.0.0_x64_en-US.msi
.\scripts\Write-Checksums.ps1 -ShowSignature
```
