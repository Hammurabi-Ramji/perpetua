# Troubleshooting

## Windows SmartScreen warning when installing/running

Unsigned builds trigger SmartScreen ("Windows protected your PC"). Click
**More info → Run anyway**. This is expected for unsigned installers; see
[RELEASE.md](./RELEASE.md) for the code-signing note.

## "Perpetua could not start" dialog

Perpetua shows a dialog (and writes the reason to the diagnostics log, see
below) instead of silently disappearing when it can't start. The two usual
causes:

- **"failed to bind Perpetua API on 127.0.0.1:18765"** — something else is
  already using port 18765. A second copy of Perpetua is handled
  automatically (it just brings the existing window to the front), so this
  means a *different* program owns the port, or a previous instance is
  still shutting down — check Task Manager for a stray `perpetua.exe`.
  Override the port with the `PERPETUA_API_PORT` environment variable
  before launching, and set the matching `VITE_PERPETUA_API_PORT` if you're
  running the dev server separately.
- **"initialising the local vault database"** — the app data folder is
  read-only, full, or the database file is locked by another process
  (an antivirus scan, a backup tool, or a copy of the app still closing).

## Diagnostics log

`%APPDATA%\perpetua\perpetua.log` on Windows
(`~/Library/Application Support/perpetua/perpetua.log` on macOS,
`~/.local/share/perpetua/perpetua.log` on Linux). Startup errors, failed
notification deliveries, and failed password-reset / test emails are
recorded there with timestamps. It never contains license keys, passwords
or vault contents, so it is safe to attach to a support email. It rolls to
`perpetua.log.1` at 1 MB.

## Can't sign in / "Invalid or expired token"

Your session token expired or the local database was reset. Sign out and back
in. If it persists, close Perpetua and check that
`%APPDATA%/perpetua/licenses.db` exists and isn't locked by another running
copy of the app.

## Screenshot autofill isn't detecting anything

- OCR works best on clear, high-contrast screenshots (a plain receipt or
  confirmation email, not a busy webpage screenshot with a lot of surrounding
  UI chrome).
- Expand **Show detected text** after an upload to see exactly what the OCR
  engine read — if the raw text looks garbled, try a higher-resolution
  screenshot or crop it to just the relevant text.
- It only recognizes English text and specific label patterns (`License Key:`,
  `Expires:`, `Total:`, etc.) — a receipt using unusual wording may need manual
  entry for that field.
- Nothing is sent anywhere — if you're checking this because you're worried
  about privacy rather than accuracy, you can confirm it yourself: open your
  OS's network monitor while uploading and you'll see no outbound requests.

## A site I added won't delete

Only sites you added yourself can be removed — the four built-in sites
(AppSumo, Humble Bundle, Product Hunt, StackSocial) are permanent. If
**Remove site** isn't showing, expand the row and confirm it's a custom site
you created via **Add a site**.

## Password reset email never arrives

- Confirm you've filled in **both** a backup email *and* your SMTP relay
  details under Reminders → Backup email & account recovery — the reset code
  is sent through your own mail server, which Perpetua doesn't configure for
  you.
- Use **Send test email** on that page while you are still signed in. It
  shows the relay's actual error message; the Forgot-password screen
  deliberately doesn't (it would reveal which emails have accounts).
- Common SMTP issues: wrong port (587 for STARTTLS, 465 for implicit TLS —
  Perpetua picks the TLS mode from the port automatically), an app-specific
  password required by your provider (e.g. Gmail) instead of your regular
  account password, or the backup email's spam folder.
- The code is 8 characters; dashes, spaces and letter case are ignored.
  Requesting a new code invalidates the previous one, so use the newest
  email.
- If you never set up a backup email before getting locked out, there's no way
  to recover the account — set one up now, before you need it.

## Sharing invite code doesn't work

- Sharing requires the vault owner's account to be Pro-activated — invites
  can't be sent from a free account.
- The invitee must be on the **same computer** as the owner's Perpetua
  install; this isn't a sync feature between two different machines.
- Codes expire — if it's been a while since the invite was sent, ask the
  owner to resend it.

## Reminders aren't showing up as desktop notifications

Perpetua's background watcher runs from the system tray, so make sure the app
hasn't been fully quit (closing the window minimizes to tray by default).
If you want it running on days you don't open it, turn on **Start Perpetua
at login** under Reminders — it is off by default. Check the **Desktop
reminders** toggle on the same page is on. Windows notification settings
can also suppress app notifications — check Settings → System →
Notifications and confirm Perpetua is allowed. If the OS refused a
notification, it is recorded in the diagnostics log and retried on the next
6-hourly pass rather than lost.

Licenses with status *refunded*, *cancelled*, *expired* or *revoked* are
excluded from reminders on purpose.

## I restored a cloud backup and lost recent changes

Restoring over an existing vault saves the previous vault first as
`perpetua-pre-restore-<timestamp>.db` in Local backups (listed under Vault
tools). It is not deleted by backup rotation. Contact support with that file
name to swap it back in, or open it with any SQLite tool to retrieve
individual records.

## Vault export or backup fails

Check that `%APPDATA%/perpetua/` isn't read-only and that you have enough
free disk space. Backups keep only the 5 most recent snapshots — older ones
are pruned automatically, which is expected, not a failure.

## Still stuck?

Email <support@hammurabi.click> with your Perpetua version (Help → About,
or `perpetua config` from a terminal), the diagnostics log, and what you
were doing when it happened.
