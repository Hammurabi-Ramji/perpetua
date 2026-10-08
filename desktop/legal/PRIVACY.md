# Perpetua — Privacy Policy

**Effective date:** 2026-10-06  
**Product:** Perpetua (local-first Lifetime License Manager desktop app)  
**Data controller:** Hammurabi Coding Company, LLC  
**Contact:** hcc@hammurabicodingcompany.com (see [SUPPORT.md](./SUPPORT.md))

## Summary

Perpetua is designed to keep your license vault on your machine. Day-to-day
vault operations do not require a cloud account, an online login, or
telemetry. Nothing in this policy changes that: every item below that leaves
your device is optional, is sent to a destination you chose, and is listed in
the table.

## Data we store locally

On your device, Perpetua may store:

- Local account credentials (passwords hashed with bcrypt; not recoverable)
- License records you enter or import (keys, URLs, notes, keep-alive dates)
- Reminder preferences and local notification dedupe state
- SQLite database files, rotated local backups, and automatic pre-restore
  snapshots
- A diagnostics log (`perpetua.log`, rolled at 1 MB) containing timestamps
  and error messages only — never license keys, passwords or vault contents

**Storage location:** a `perpetua` folder in the operating system's per-user
application data directory (Windows: `%APPDATA%\perpetua`; exact path varies
by OS).

**At rest:** the SQLite vault is **not encrypted at rest** in the current
build. Opening the database file still shows a normal `SQLite format 3`
header. SQLCipher was not enabled because this environment cannot compile
it (Git for Windows Perl cannot load `Locale::Maketext::Simple`, and
Strawberry Perl is not installed). Protect device access accordingly; use
OS disk encryption where available.

An encrypted vault, if a later build ships one, would cover the database
file against offline theft and other OS users. It would **not** stop
malware running as the same user, who can read both the file and the OS
keychain.

Secrets that are already kept out of the database file: your SMTP relay
password, your cloud-backup WebDAV password, the cloud-backup encryption
key, and any Auto-Maintain vendor username/password. Those live in your
operating system's credential store (Windows Credential Manager / macOS
Keychain / Secret Service). Vendor passwords are never returned by the
local API and are not submitted to vendor sites.

## Data that may leave your device

| Action | Data sent | Destination |
|--------|-----------|-------------|
| Polar Pro activation (optional) | The license key you paste, as required by Polar to validate it | Polar.sh APIs |
| Password reset code / vault-sharing invite / cloud-backup recovery key / test email / due reminder (optional) | A short code, key, or reminder text, by email | Your own SMTP relay — never a Perpetua-operated server |
| Activity inference (optional, off by default) | A hostname that matches one of your licenses, and then only a date stored locally | Your own Perpetua instance, at `127.0.0.1` — this never leaves your device |
| Cloud backup (optional, Pro) | Your full vault, encrypted with AES-256-GCM **before it leaves your device** | A WebDAV server **you configure** (e.g. your own Koofr account), over HTTPS — never a Perpetua-operated server |
| Browser extension sync (optional) | Licenses scraped from a deal site's own account page | Your own Perpetua instance, at `127.0.0.1` — this never leaves your device |
| None of the above | — | — |

Perpetua does **not** send product telemetry, analytics, crash reports, or
vault contents to Hammurabi Coding Company, LLC servers during normal use.
Cloud backup sends encrypted vault data to a third-party storage provider,
but only one you explicitly configure and control — Perpetua has no server of
its own in that path, and cannot decrypt what it uploads (the encryption key
never leaves your device either, beyond the safety-net email above).

## Purchases (Polar.sh)

Pro is sold by Polar.sh acting as Merchant of Record. When you buy, Polar
collects the payment, billing and contact details it needs under its own
privacy policy, and shares with us the order record (order id, product,
amount, and the email the key was sent to) so we can answer a support
request or a refund under the Terms. Our purchase-notification service logs order and customer
identifiers only, not names, emails or addresses. We do not receive card
numbers.

## Website

The product website (`perpetua.hammurabi.click`) is static. If it uses
analytics, that is disclosed on the website itself; the desktop app contains
no analytics and never contacts the website.

## Free tier and Pro

Entitlement state (free cap vs Pro) is stored locally. Online Polar
activation is optional; offline fulfillment keys may be used without
contacting Polar.

## Your choices

- Export or delete vault data via in-app Vault Tools, or by deleting the app
  data directory.
- Decline Polar activation and remain on the free tier (3 licenses).
- Turn desktop reminders off in Reminder settings (they are on by default
  for new accounts; the setting is honoured by the background checker).
- "Start Perpetua at login" is **off by default** and only changes when you
  flip the toggle in Reminder settings. Perpetua never registers itself to
  start at login on its own.
- Clear the browser extension's stored token from its Options page at any
  time.

## Children

Perpetua is not directed at children under 13.

## Changes

Material changes to this policy will be reflected by updating the effective
date in this file and, when distributed as a product update, release notes.

## Contact

Privacy questions: hcc@hammurabicodingcompany.com with "Privacy" in the subject
line.
