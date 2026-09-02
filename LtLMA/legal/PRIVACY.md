# Perpetua — Privacy Policy

**Effective date:** 2026-09-02  
**Product:** Perpetua (local-first Lifetime License Manager desktop app)  
**Support:** see [SUPPORT.md](./SUPPORT.md)

## Summary

Perpetua is designed to keep your license vault on your machine. Day-to-day
vault operations do not require a cloud account or telemetry.

## Data we store locally

On your device, Perpetua may store:

- Local account credentials (passwords hashed with bcrypt; not recoverable)
- License records you enter or import (keys, URLs, notes, keep-alive dates)
- Reminder preferences and local notification dedupe state
- SQLite database files and rotated local backups

**Storage location:** the operating system application data directory for
`com.perpetua.app` (exact path varies by OS).

**At rest:** the SQLite vault is **not encrypted at rest** in the current
release. Protect device access accordingly; use OS disk encryption where
available. The exceptions are secrets that don't belong in a database file
even an unencrypted one already accepts as a tradeoff: your SMTP relay
password, your cloud-backup WebDAV password, and the cloud-backup
encryption key all live in your operating system's credential store
(Windows Credential Manager / macOS Keychain / Secret Service) instead.

## Data that may leave your device

| Action | Data sent | Destination |
|--------|-----------|-------------|
| Polar Pro activation (optional) | Activation key / customer-portal token as required by Polar | Polar.sh APIs |
| Password reset code / vault-sharing invite / cloud-backup recovery key (optional) | A short code or key, by email | Your own SMTP relay, to your backup email address — never a Perpetua-operated server |
| Cloud backup (optional, Pro) | Your full vault, encrypted with AES-256-GCM **before it leaves your device** | A WebDAV server **you configure** (e.g. your own Koofr account) — never a Perpetua-operated server |
| Browser extension sync (optional) | Licenses scraped from a deal site's own account page | Your own Perpetua instance, at `127.0.0.1` — this never leaves your device |
| None of the above | — | — |

Perpetua does **not** send product telemetry, analytics, or vault contents to
Hammurabi Coding Company, LLC servers during normal use. Cloud backup sends
encrypted vault data to a third-party storage provider, but only one you
explicitly configure and control — Perpetua has no server of its own in
that path, and cannot decrypt what it uploads (the encryption key never
leaves your device either, beyond the safety-net email above).

## Free tier and Pro

Entitlement state (free cap vs Pro) is stored locally. Online Polar activation
is optional; offline fulfillment keys may be used without contacting Polar.

## Your choices

- Export or delete vault data via in-app Vault tools or by deleting the app
  data directory.
- Decline Polar activation and remain on the free tier (3 licenses).
- Disable browser notifications in Reminder settings.

## Children

Perpetua is not directed at children under 13.

## Changes

Material changes to this policy will be reflected by updating the effective
date in this file and, when distributed as a product update, release notes.

## Contact

Privacy questions: use the contact listed in [SUPPORT.md](./SUPPORT.md).
