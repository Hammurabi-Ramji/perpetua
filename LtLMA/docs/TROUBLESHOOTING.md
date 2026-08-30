# Troubleshooting

## Windows SmartScreen warning when installing/running

Unsigned builds trigger SmartScreen ("Windows protected your PC"). Click
**More info → Run anyway**. This is expected for unsigned installers; see
[RELEASE.md](./RELEASE.md) for the code-signing note.

## "Failed to bind Perpetua API on 127.0.0.1:18765"

Something else is already using port 18765 (or a previous Perpetua instance
didn't shut down cleanly — check Task Manager for a stray `perpetua.exe`).
Override the port with the `PERPETUA_API_PORT` environment variable before
launching, and set the matching `VITE_PERPETUA_API_PORT` if you're running the
dev server separately.

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
- Common SMTP issues: wrong port (587 for STARTTLS, 465 for implicit TLS),
  an app-specific password required by your provider (e.g. Gmail) instead of
  your regular account password, or the backup email's spam folder.
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
Windows notification settings can also suppress app notifications — check
Settings → System → Notifications and confirm Perpetua is allowed.

## Vault export or backup fails

Check that `%APPDATA%/perpetua/` isn't read-only and that you have enough
free disk space. Backups keep only the 5 most recent snapshots — older ones
are pruned automatically, which is expected, not a failure.

## Still stuck?

Open an issue on the project's GitHub repository with your Perpetua version
(`perpetua config` from a terminal) and what you were doing when it happened.
