# Perpetua — Privacy Policy

**Effective date:** 2026-07-19  
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
available. The one exception is your SMTP relay password (if you configure
backup-email password reset or vault sharing): that's stored in your
operating system's credential store (Windows Credential Manager / macOS
Keychain / Secret Service), not in the SQLite file.

## Data that may leave your device

| Action | Data sent | Destination |
|--------|-----------|-------------|
| Polar Pro activation (optional) | Activation key / customer-portal token as required by Polar | Polar.sh APIs |
| None of the above | — | — |

Perpetua does **not** send product telemetry, analytics, or vault contents to
Hammurabi Coding Company, LLC servers during normal use.

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
