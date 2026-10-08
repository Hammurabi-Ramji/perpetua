# Project status

What works, what doesn't yet, and what's next — kept current as of **v1.0.0**.
For day-to-day usage, see the [User Guide](./USER_GUIDE.md); for problems, see
[Troubleshooting](./TROUBLESHOOTING.md).

## What works

- **License vault** — add, edit, delete, search; free tier holds 3 licenses,
  Pro unlocks unlimited (Polar checkout or an offline key)
- **Screenshot autofill** — upload a receipt or confirmation email and it
  pulls out the license key, purchase/expiry dates, and amount. Runs fully
  offline (local OCR); nothing leaves the device
- **Sites** — AppSumo, Humble Bundle, Product Hunt, and StackSocial out of
  the box, or add your own marketplace sources
- **Keep-alive reminders** — flags licenses before a vendor's inactivity
  window lapses, with vendor-policy suggestions where the site is
  recognized; native desktop notifications fire even when the window is
  closed (background watcher + system tray). Honours the per-account
  "Desktop reminders" toggle, skips refunded/cancelled/expired licenses,
  and only records a reminder as delivered once the OS accepted it.
  Snooze and dismiss are stored per occurrence. Mark as used remains.
  Email reminders send through the user's own SMTP relay when that toggle
  is on and the relay is configured; otherwise nothing is marked sent
- **Activity inference (opt-in)** — when enabled in the app and the browser
  extension, a visit to a hostname that matches a license resets
  `last_active` the same way Mark as used does. Only that date is stored
- **Token revocation** — JWTs carry `token_version`. Password changes and
  **Revoke extension token** bump it. Stale tokens, including the extension
  pairing token, are rejected. The desktop session that requested the
  revoke receives a new token
- **Launch at login (opt-in)** — a toggle under Reminders; off by default,
  never enabled by the app on its own. A second launch brings the running
  instance to the front instead of fighting it for the API port
- **Startup diagnostics** — a fatal startup error shows a dialog and is
  written to `perpetua.log` in the app data folder (rolled at 1 MB), along
  with failed notification deliveries and failed emails
- **First-time walkthrough** — new accounts get a short guided tour through
  adding their first license
- **Backup email & password reset** — set a backup email and your own SMTP
  relay (TLS mode chosen from the port, 30 s timeout, password kept in the
  OS credential store and never echoed back), send a test email to prove
  it works, and recover the account with a one-time 8-character code if
  locked out (a new request invalidates the old code)
- **Vault sharing (Pro)** — share license storage with one other account on
  the same computer
- **Export & backup** — JSON/CSV export, local backup snapshots (5 most
  recent kept)
- **Native menu bar** — File / View / Help, with Sign Out and quick
  navigation to every page
- **Cross-platform** — release workflow builds Windows, macOS Apple Silicon
  (`macos-latest`), macOS Intel (`macos-15-intel`, GitHub's last Intel
  image, through August 2027), and Linux. `macos-13` is not used; it was
  removed in December 2025
- **Encrypted cloud backup & restore (Pro)** — back up the vault to your own
  WebDAV storage (HTTPS required; works generically against any WebDAV
  server), encrypted with AES-256-GCM before it leaves the device. Uploads
  go to a temporary name, are read back and compared, then moved into
  place. A one-time recovery key is shown on screen and emailed as a safety
  net; re-saving settings keeps the key unless you explicitly rotate it. A
  brand-new install can restore from that backup pre-login — no prior
  session needed — which is what actually makes "get your vault back on a
  new machine" work. Once an install has an account, restore moves behind
  sign-in + an explicit confirmation, and an automatic pre-restore snapshot
  is taken first. An optional schedule (off by default) repeats that same
  upload. **Sync with another computer** compares vault timestamps:
  upload if local is newer, download only if the remote copy is strictly
  newer, do nothing if they match. A wrong recovery key does not replace
  the local vault. A failed upload does not replace the previous cloud copy
- **Auto-Maintain (Pro, opt-in per license)** — stores a vendor password in
  the OS keychain only, writes an audit row for each attempt, and then
  falls back to the normal keep-alive reminder. It does not log into
  vendor sites or submit those passwords
- **Local API hardening** — loopback-only bind, bearer auth, rate limits on
  credential/code routes, and a `Host`-header check that refuses requests
  from DNS-rebinding pages. Emails are case-insensitive; login timing is
  the same for unknown and known accounts.
- **Browser extension (companion, not bundled in the installer)** — captures
  lifetime-deal purchases from AppSumo, Product Hunt, StackSocial, and
  Humble Bundle and imports them straight into your vault. Paired with a
  one-time token you copy from Vault Tools; lives at
  `browser-extension/`, loaded unpacked for now (see its own README).

## Known limitations

- **Unsigned builds.** Windows shows a SmartScreen warning, macOS a
  Gatekeeper warning, on first launch — expected until code signing is set
  up, not a sign anything is wrong.
- **The vault itself is still not encrypted at rest.** `init_db_at` still
  writes a file whose header is `SQLite format 3`. SQLCipher via
  `bundled-sqlcipher-vendored-openssl` was not enabled. Exact blocker on
  this machine: `C:\Program Files\Git\usr\bin\perl.exe` fails with
  `Can't locate Locale/Maketext/Simple.pm`, and
  `C:\Strawberry\perl\bin\perl.exe` is not installed. Without that Perl,
  OpenSSL cannot be configured and the vendored SQLCipher build cannot
  finish. SMTP, WebDAV, the cloud recovery key, and Auto-Maintain vendor
  passwords are in the OS credential store. License keys in `licenses.db`
  are not. This does not protect against malware running as the same user,
  and neither would SQLCipher.
- **Password reset, sharing invites, reminder email, and the cloud-backup
  recovery-key safety net all require your own SMTP relay.** Perpetua has
  no built-in mail service by design.
- **Auto-Maintain does not log into vendors.** There is no headless browser
  and no adapter that can complete 2FA or CAPTCHA. Opted-in licenses get an
  audit row and the normal reminder.
- **In-app updates are not configured.** Help → Check for Updates says so
  and does not download a build. The endpoint is GitHub Releases
  `latest.json`. The owner must set `plugins.updater.pubkey`, turn on
  `createUpdaterArtifacts`, and set `TAURI_SIGNING_PRIVATE_KEY` plus
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. No private key was generated here.
- **Windows code signing is wired, not active.** The release workflow
  installs `trusted-signing-cli` and passes the Azure Artifact Signing
  secrets. `PERPETUA_REQUIRE_SIGNING=1` is set on Windows only when
  `PERPETUA_AZURE_SIGNING_ENDPOINT` is non-empty. No certificate was
  generated.
- **Cloud backup keeps one remote object, not a history.** Scheduled upload
  and device sync both use that object. Device sync is last-write-wins by
  vault timestamp. It is not a live session. Local backups keep their own
  5-deep rotation.
- **Vault sharing is same-computer only.** Two machines use
  Sync with another computer, not the sharing invite.
- **Browser extension is unpacked-load only.** Not published to the Chrome
  Web Store; DOM selectors against the four deal sites are inherently
  fragile against site redesigns and haven't been re-verified against live
  markup since the rework.
- **Live Polar checkout is unverified end-to-end.** The offline-key
  activation path is solid; a real Polar purchase hasn't been run through
  the full flow. The release pipeline now refuses to build without the
  Polar organization id and checks the finished binary reports activation
  ENABLED, but the checkout link itself (`VITE_PERPETUA_CHECKOUT_URL`) still
  has to be set as a repository variable before the Buy button goes
  straight to checkout.
- **Vendor-policy dataset is low-confidence throughout.** Suggestions are
  shown with their confidence and are never applied automatically on
  import.

## What's next

Not commitments — just the natural follow-ons. The owner-action items that
block a public launch (signing certificate, repository secrets/variables,
replacing the v1.0.0 release assets, clean-machine smoke test) are tracked in
[`docs/REMAINING_TASKS.md`](../../docs/REMAINING_TASKS.md) at the
repository root.

- Encrypt the vault at rest once a Perl that can build OpenSSL is available
  (Strawberry Perl, or equivalent, ahead of Git's perl on `PATH`)
- Create the Azure Artifact Signing account and set the secrets the release
  workflow already reads
- Generate the Tauri updater keypair and set the pubkey plus
  `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Verify a real Koofr cloud-backup round-trip and a real restore-on-a-fresh-
  install end to end
- Verify the browser extension against live deal-site markup; consider a
  Chrome Web Store listing once the paste-a-token flow feels durable
- Verify the live Polar purchase flow end-to-end
