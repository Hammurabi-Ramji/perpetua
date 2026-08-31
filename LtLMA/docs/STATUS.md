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

## Known limitations

- **Unsigned builds.** Windows shows a SmartScreen warning, macOS a
  Gatekeeper warning, on first launch — expected until code signing is set
  up, not a sign anything is wrong.
- **macOS: Apple Silicon only.** No Intel (x86_64) build yet.
- **Vault sharing is same-computer only**, not cross-device sync. A
  different person on their own separate machine would need a real hosted
  backend — a genuinely different, much larger project, and a departure
  from the local-first design.
- **"Enable email reminders" doesn't send anything yet.** The setting is
  stored but reminder delivery is desktop notifications only for now.
- **Password reset and sharing invites require your own SMTP relay.**
  Perpetua has no built-in mail service by design.
- **"Auto-Maintain" is a placeholder**, not a feature. Automatically
  completing vendor logins would mean storing vendor credentials and
  driving a browser — deliberately not built.
- **No in-app auto-updater.** Reinstall from a new release to update.
- **Live Polar checkout is unverified end-to-end.** The offline-key
  activation path is solid; a real Polar purchase hasn't been run through
  the full flow.

## What's next

Not commitments — just the natural follow-ons:

- macOS Intel build (one more CI matrix entry)
- Code signing for Windows/macOS
- Wire up actual email delivery for the reminders toggle (the SMTP
  infrastructure already exists from password reset/sharing)
- Auto-updater
- Verify the live Polar purchase flow end-to-end
