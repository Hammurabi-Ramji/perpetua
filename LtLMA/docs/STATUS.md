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
  closed (background watcher + system tray)
- **First-time walkthrough** — new accounts get a short guided tour through
  adding their first license
- **Backup email & password reset** — set a backup email and your own SMTP
  relay, and recover the account with a one-time code if locked out
- **Vault sharing (Pro)** — share license storage with one other account on
  the same computer
- **Export & backup** — JSON/CSV export, local backup snapshots (5 most
  recent kept)
- **Native menu bar** — File / View / Help, with Sign Out and quick
  navigation to every page
- **Cross-platform** — installers for Windows, macOS (Apple Silicon), and
  Linux, all built from the same source
- **Encrypted cloud backup & restore (Pro)** — back up the vault to your own
  WebDAV storage (proven against Koofr; works generically against any
  WebDAV server), encrypted with AES-256-GCM before it leaves the device. A
  one-time recovery key is shown on screen and emailed as a safety net. A
  brand-new install can restore from that backup pre-login — no prior
  session needed — which is what actually makes "get your vault back on a
  new machine" work, not just "back it up."
- **Browser extension (companion, not bundled in the installer)** — captures
  lifetime-deal purchases from AppSumo, Product Hunt, StackSocial, and
  Humble Bundle and imports them straight into your vault. Paired with a
  one-time token you copy from Vault Tools; lives at
  `browser-extension/`, loaded unpacked for now (see its own README).

## Known limitations

- **Unsigned builds.** Windows shows a SmartScreen warning, macOS a
  Gatekeeper warning, on first launch — expected until code signing is set
  up, not a sign anything is wrong.
- **macOS: Apple Silicon only.** No Intel (x86_64) build yet.
- **Vault sharing is same-computer only**, not live cross-device sync. Cloud
  backup/restore covers the disaster-recovery case (get your vault onto a
  *new* machine); it isn't real-time multi-device sync — two machines
  active at once would each need their own backup/restore cycle, not a
  live shared session.
- **The vault itself is still not encrypted at rest.** SMTP password,
  WebDAV password, and the cloud-backup encryption key all live in the OS
  credential store now — the license keys in the SQLite file do not yet.
  Biggest open item from the original security review (P1-5).
- **"Enable email reminders" doesn't send anything yet.** The setting is
  stored but reminder delivery is desktop notifications only for now.
- **Password reset, sharing invites, and the cloud-backup recovery-key
  safety net all require your own SMTP relay.** Perpetua has no built-in
  mail service by design.
- **"Auto-Maintain" is a placeholder**, not a feature. Automatically
  completing vendor logins would mean storing vendor credentials and
  driving a browser — deliberately not built.
- **No in-app auto-updater.** Reinstall from a new release to update.
- **No session/token revocation.** JWTs (including the browser extension's
  pairing token) are stateless with a 30-day expiry and no revocation
  list — a password change doesn't invalidate tokens issued before it.
- **Cloud backup keeps one remote copy, not a history.** Each sync
  overwrites the previous cloud backup; local backups keep their own
  5-deep rotation independently.
- **Browser extension is unpacked-load only.** Not published to the Chrome
  Web Store; DOM selectors against the four deal sites are inherently
  fragile against site redesigns and haven't been re-verified against live
  markup since the rework.
- **Live Polar checkout is unverified end-to-end.** The offline-key
  activation path is solid; a real Polar purchase hasn't been run through
  the full flow.

## What's next

Not commitments — just the natural follow-ons:

- Encrypt the vault itself at rest, not just the secrets around it
- macOS Intel build (one more CI matrix entry)
- Code signing for Windows/macOS
- Wire up actual email delivery for the reminders toggle (the SMTP
  infrastructure already exists from password reset/sharing)
- Auto-updater
- Session/token revocation (a `token_version` bump on password change)
- Verify a real Koofr cloud-backup round-trip and a real restore-on-a-fresh-
  install end to end
- Verify the browser extension against live deal-site markup; consider a
  Chrome Web Store listing once the paste-a-token flow feels durable
- Verify the live Polar purchase flow end-to-end
