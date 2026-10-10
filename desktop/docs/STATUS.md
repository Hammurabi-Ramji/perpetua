# Project status

What works, what doesn't yet, and what's next — kept current as of **v1.0.0**.
For day-to-day usage, see the [User Guide](./USER_GUIDE.md); for problems, see
[Troubleshooting](./TROUBLESHOOTING.md).

## What works

- **License vault** — add, edit, delete, search; free tier holds 3 licenses,
  Pro unlocks unlimited ($49.99 one-time, activated through Polar)
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
  and only records a reminder as delivered once the OS accepted it
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
- **Cross-platform** — installers for Windows, macOS (Apple Silicon), and
  Linux, all built from the same source
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
  is taken first.
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
- **No email reminders.** Reminder delivery is desktop notifications only.
  The toggle that implied otherwise has been removed from the UI (the
  column still exists in the database for a future implementation).
- **Password reset, sharing invites, and the cloud-backup recovery-key
  safety net all require your own SMTP relay.** Perpetua has no built-in
  mail service by design.
- **"Auto-Maintain" is a placeholder**, not a feature. Automatically
  completing vendor logins would mean storing vendor credentials and
  driving a browser — deliberately not built. The card now points at the
  support mailbox instead of a "Notify me" button that recorded nothing.
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

- Encrypt the vault itself at rest, not just the secrets around it
- macOS Intel build (one more CI matrix entry)
- Code signing for Windows/macOS
- Email delivery for reminders (the SMTP infrastructure already exists from
  password reset/sharing) — only once there is a sender to back the toggle
- Auto-updater
- Session/token revocation (a `token_version` bump on password change)
- Verify a real Koofr cloud-backup round-trip and a real restore-on-a-fresh-
  install end to end
- Verify the browser extension against live deal-site markup; consider a
  Chrome Web Store listing once the paste-a-token flow feels durable
- Verify the live Polar purchase flow end-to-end
