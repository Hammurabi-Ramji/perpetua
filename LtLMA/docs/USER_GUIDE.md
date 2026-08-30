# Perpetua User Guide

Perpetua is a local-first desktop vault for lifetime software licenses. Everything
you add — keys, dates, sites, notes — lives in a SQLite database on your own
machine (`%APPDATA%/perpetua/licenses.db`). Nothing is uploaded anywhere unless
you explicitly configure it to (see [Backup email](#backup-email--password-reset)).

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

- **Desktop reminders** — native OS notifications, delivered even when the
  window is closed (Perpetua keeps a background watcher and a system tray
  icon, and starts at login).
- **Keep-alive days** per license (set on the license form, or accept the
  vendor-policy suggestion) — Perpetua flags a license before its keep-alive
  window lapses so you can log in and reset the clock. Open the license and
  click **Mark as used** once you have.

## Backup email & password reset

Set a **backup email** and your own SMTP relay details (host, port, username,
password) under Reminders → **Backup email & account recovery**. This is only
ever used to send you a one-time reset code if you're locked out of your
account — Perpetua has no built-in mail service, so it sends through *your*
mail server, and the credentials are stored locally like everything else in
your vault.

Locked out? Use **Forgot password?** on the sign-in screen, enter your account
email, and check the backup inbox for a 6-digit code.

## Sharing your vault (Pro)

Pro accounts can share their license vault with one other local account on the
**same computer** (e.g. a family member with their own login) — this is not
cross-device sync; Perpetua doesn't talk to the internet beyond your own SMTP
server. Under Reminders → **Sharing**, enter the other person's email to send
them an invite code (via the SMTP settings above). They register their own
account (or log in if they already have one) and redeem the code — from then
on their account sees and manages the same license storage as yours.

## Vault export & backup

Under **Vault tools**: export your licenses as JSON or CSV, or create a local
backup snapshot of the whole database. Backups rotate automatically (the 5
most recent are kept).

## Upgrading to Pro

The free tier stores up to 3 licenses. **Unlock unlimited** opens the upgrade
flow — either a Polar-hosted purchase (if configured) or an offline license
key you can activate directly.

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
