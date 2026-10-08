# Perpetua User Guide

Perpetua is a local-first desktop vault for lifetime software licenses. Everything
you add — keys, dates, sites, notes — lives in a SQLite database on your own
machine (`%APPDATA%/perpetua/licenses.db`). Nothing is uploaded anywhere unless
you explicitly configure it to (see [Backup email](#backup-email--password-reset)
and [Cloud backup](#cloud-backup--restore-pro)).

## Getting started

1. Launch Perpetua and create a local account (email + password — this account
   only exists on this machine, there's no cloud sign-up).
2. On first login you'll see a short "Get started" panel on the Dashboard —
   it opens the Add a license form for you. Dismiss it any time; it won't
   reappear once you've added your first license or skipped it.
3. From here on it's rinse and repeat: **Add a license** whenever you buy a new
   lifetime deal.

## Adding a license

Open **Licenses → Add license** (or the shortcut on the Dashboard). You can fill
every field by hand, or:

### Autofill from a screenshot

Click **Autofill from screenshot** and upload an image of a purchase receipt or
confirmation email. Perpetua runs OCR entirely on your device (no image or text
ever leaves your computer — see the note under the upload button) and tries to
pull out:

- **License key** — matched against labels like `License Key:`, `Serial:`,
  `Activation Code:`, or a generic dash-separated key pattern.
- **Purchase date** / **Expiry date** — matched near labels like `Purchased`,
  `Order Date`, `Expires`, `Valid until`.
- **Purchase amount** — matched near `Total`, `Price`, `Amount`, `Paid`, and
  appended as a line in **Notes** (there's no dedicated amount field).

It only fills in fields that are currently empty — anything you've already typed
is never overwritten. If a field wasn't detected, expand **Show detected text**
to see the raw OCR output and fill it in by hand.

### Keep-alive suggestions

As you type a **Source site** or **Product name**, Perpetua checks a bundled
vendor-policy dataset and may suggest a **Keep-alive: log in every (days)**
value (e.g. "Suggested 90 days for AppSumo"). Click **Apply suggestion** to use
it, or just type your own — it never overwrites a value you've already set.

## Sites

**Sites** tracks the marketplaces your lifetime deals come from (AppSumo,
StackSocial, Humble Bundle, Product Hunt, and any custom ones you add). Each
site is a single-line row — click it to expand for details and actions:

- **Connect / Disconnect** — marks whether you're actively tracking that site.
- **Add a site** — track a marketplace Perpetua doesn't ship with. Give it a
  name and URL; it's connected automatically.
- **Remove site** — only available on sites you added yourself (the built-in
  four can't be removed). Click once to arm it, click **Confirm remove?** to
  actually delete it.

## Reminders & keep-alive

Many lifetime deals get revoked if the account goes inactive for too long.
**Reminders** shows everything due in the next 30 days — expirations and
required actions — and lets you configure:

- **Desktop reminders** — native OS notifications for anything due in the
  next 7 days, delivered even when the window is closed (Perpetua keeps a
  background watcher and a system tray icon). On by default; turn the
  toggle off to silence them.
- **Start Perpetua at login** — off by default. Turn it on if you want
  reminders to fire on days you don't open the app yourself; it launches
  minimised to the tray. Perpetua never changes this on its own.
- **Keep-alive days** per license (set on the license form, or accept the
  vendor-policy suggestion) — Perpetua flags a license before its keep-alive
  window lapses so you can log in and reset the clock. Open the license and
  click **Mark as used** once you have. That button is still the default.
- **Email reminders** — off until you turn them on, and only after an SMTP
  relay is saved. Due reminders then go out through that same relay. Saving
  the toggle does not send a message. If the relay is missing or rejects the
  message, Perpetua logs it and does not treat the mail as sent. Perpetua
  does not run a mail server.
- **Snooze** and **Dismiss** on a reminder row. Snooze hides that due date
  for the duration you pick (1 hour, 4 hours, 1 day, 3 days, or 1 week).
  Dismiss hides that due date only. A later due date shows up again. Neither
  one replaces Mark as used.
- **Reset keep-alive when I visit a matching site** — off by default. With
  the browser extension also opted in, opening a hostname that matches one
  of your licenses resets that license the same way Mark as used does.
  Perpetua stores only that date. It does not read your inbox.

**Auto-Maintain** (Pro, separate opt-in per license) can store a vendor
username and password in the OS keychain. Perpetua does not log into the
vendor, submit that password, or bypass 2FA or CAPTCHA. Each attempt is
written to an audit log (time, license, outcome) and the normal keep-alive
reminder still fires. The free vault does not include this.

## Backup email & password reset

Set a **backup email** and your own SMTP relay details (host, port, username,
password) under Reminders → **Backup email & account recovery**. This is only
ever used to send you a one-time reset code if you're locked out of your
account — Perpetua has no built-in mail service, so it sends through *your*
mail server. The SMTP password goes into your OS credential store and is
never shown again; leave the field blank when re-saving to keep it. Port 465
uses implicit TLS, 587 (and anything else) uses STARTTLS. After saving, click
**Send test email** — if the test doesn't arrive, a reset code won't either.

Locked out? Use **Forgot password?** on the sign-in screen, enter your account
email, and check the backup inbox for an 8-character code (dashes, spaces
and letter case don't matter when you type it in). Requesting a new code
invalidates the previous one.

## Sharing your vault (Pro)

Pro accounts can share their license vault with one other local account on the
**same computer** (e.g. a family member with their own login). That share is
not the multi-device sync described under cloud backup. Under Reminders →
**Sharing**, enter the other person's email to send
them an invite code (via the SMTP settings above). They register their own
account (or log in if they already have one) and redeem the code — from then
on their account sees and manages the same license storage as yours.

## Vault export & backup

Under **Vault tools**: export your licenses as JSON or CSV, or create a local
backup snapshot of the whole database. Backups rotate automatically (the 5
most recent are kept).

## Cloud backup & restore (Pro)

Local backups protect you from a bad edit; cloud backup protects you from
losing the machine entirely. Under **Vault tools → Cloud backup (WebDAV)**,
enter your WebDAV server URL, username, and password — Koofr is a good
default, but any WebDAV-speaking storage works. You'll need a **backup
email and SMTP relay already configured** (see above) first, since that's
where the safety net below gets sent.

Click **Enable cloud backup**. Perpetua encrypts your vault with a
randomly-generated key before anything leaves your device, and shows you
that **recovery key exactly once** — copy it somewhere safe (a password
manager, ideally). A copy is also emailed to your backup address as a
safety net, but the on-screen copy is the one to actually keep. **Without
this key, not even Perpetua can decrypt your cloud backup.**

Use **Back up to cloud now** any time you want a fresh snapshot uploaded.
Perpetua doesn't keep a history in the cloud — each upload replaces the
previous one — so this is a disaster-recovery copy, not a version history.
Uploads are written to a temporary name and verified by reading them back
before replacing the previous copy, so a dropped connection can't leave you
with a half-written backup. A failed upload is logged and does not erase the
previous good copy.

**Scheduled upload** is off unless you turn it on and pick 6 hours, 12 hours,
24 hours, or 7 days. It uses that same upload. It is not live sync.

**Sync with another computer** is the path for two machines that already
share this cloud backup. Perpetua compares vault timestamps. If this
computer is newer, it uploads. If the cloud copy is strictly newer, it
downloads and replaces the local vault (a pre-restore snapshot is kept).
If the timestamps match, nothing is replaced. That is last-write-wins by
backup timestamp, not a live shared session. A wrong recovery key stops the
sync and leaves the local vault unchanged. A newer local vault is never
replaced silently.

Re-saving the WebDAV settings (a new app password, say) keeps your existing
recovery key; leave the password blank to keep the stored one. Tick
**Generate a new recovery key** only if you mean it — backups already in the
cloud will only open with the old key until a fresh one has been uploaded.

**Restoring on a new machine:** on the sign-in screen of a fresh Perpetua
install (one with no accounts yet), click **Restore from cloud backup**,
enter the same WebDAV credentials and your recovery key, and your entire
vault — accounts, licenses, everything — comes back. No prior login needed;
that's the whole point.

**Restoring over an existing vault:** once this install has an account, the
sign-in screen no longer offers restore. Sign in, go to **Vault tools →
Restore from cloud backup**, tick the acknowledgement, and confirm. Perpetua
saves the current vault as `perpetua-pre-restore-<timestamp>.db` in Local
backups first (it is not part of the 5-deep rotation), so a mistaken restore
can be undone with that file.

## Browser extension

A companion browser extension can auto-capture lifetime-deal purchases
from AppSumo, Product Hunt, StackSocial, and Humble Bundle straight into
your vault as you browse. It's not bundled in the installer — load it
unpacked from `browser-extension/` in the app's source tree (see that
folder's own README for setup).

To pair it: open **Vault tools → Browser extension → Reveal token for
extension**, copy the token shown, and paste it into the extension's
Options page. Treat it like a password — it's a real 30-day Perpetua
session credential. **Revoke extension token** invalidates that copy
immediately. Perpetua stays signed in and shows a new session token.
Changing your password also invalidates older tokens.

Visit-based keep-alive (above) stays off until you enable it in Perpetua
and in the extension. Only a matching hostname is sent, and only to
Perpetua on this computer.

## Upgrading to Pro

The free tier stores up to 3 licenses. Pro is a single purchase: pay once and
the license cap stays off. It is not a subscription, and it does not include
a lifetime support plan. **Unlock unlimited** opens a Polar checkout when this
build has a checkout link, or you can activate an offline license key.

## Updates

**Help → Check for Updates** looks at whether this build can install a
GitHub Release. Right now the updater public key is not set, so the check
says updates are not configured and does not download anything. The owner
has to generate a Tauri updater keypair, put the public key in
`desktop/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`), set
`bundle.createUpdaterArtifacts` to true, and store the private key as the
GitHub Actions secrets `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The private key is not in this
repository. The manifest URL is
`https://github.com/Hammurabi-Ramji/PERPETUA/releases/latest/download/latest.json`.

## On disk

The license database on this computer is still a normal SQLite file. It is
not encrypted at rest in this build: compiling SQLCipher needs a Perl that
can load `Locale::Maketext::Simple`, and the Perl shipped with Git for
Windows cannot. SMTP passwords, WebDAV passwords, the cloud recovery key,
and Auto-Maintain vendor passwords are in the OS credential store instead.
Disk encryption (BitLocker, FileVault, or LUKS) is still the right extra
layer. Even a future encrypted vault would not stop malware running as the
same user.

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
