# Perpetua — Privacy Policy

**Effective date:** 2026-09-02  
**Product:** Perpetua (local-first Lifetime License Manager desktop app)  
**Controller:** Hammurabi Coding Company, LLC  
**Contact:** support@hammurabi.click (see also [SUPPORT.md](./SUPPORT.md))

## Summary

Perpetua is designed to keep your license vault on your machine. Day-to-day
vault operations do not require a cloud account or telemetry.

## Data we store locally

On your device, Perpetua may store:

- Local account credentials (passwords hashed with bcrypt; not recoverable)
- License records you enter or import (keys, URLs, notes, keep-alive dates)
- Reminder preferences and local notification dedupe state
- An optional launch-at-login setting (off by default; you can turn it on or off in Reminders)
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

## Website and purchases

The Perpetua website measures aggregate page visits using an analytics
script. The desktop app itself does not include this script and sends no
analytics (see above).

Purchases are processed by Polar.sh, which acts as merchant of record.
Polar collects the purchaser's name, email address, and billing country, and
handles payment and tax; Hammurabi Coding Company, LLC does not receive your
payment card details. Polar's own privacy policy governs the data it holds.
Refund requests go to support@hammurabi.click.

## Free tier and Pro

Entitlement state (free cap vs Pro) is stored locally. Online Polar activation
is optional; offline fulfillment keys may be used without contacting Polar.

## Your choices

- Export or delete vault data via in-app Vault tools or by deleting the app
  data directory.
- Decline Polar activation and remain on the free tier (3 licenses).
- Turn off desktop reminders in Reminders settings.

## Your rights and retention

You may ask us for access to, or deletion of, any personal data that
Hammurabi Coding Company, LLC holds about you (for example, purchase or
support correspondence) by emailing support@hammurabi.click. Data held by
Polar.sh as merchant of record is subject to Polar's policies and requests
may need to be directed to Polar. Data in the app is stored locally and is
under your control; you can delete it at any time by removing the app data
directory (or using the in-app Vault tools).

## Children

Perpetua is not directed at children under 13.

## Changes

Material changes to this policy will be reflected by updating the effective
date in this file and, when distributed as a product update, release notes.

## Contact

Privacy questions: support@hammurabi.click (Hammurabi Coding Company, LLC).
