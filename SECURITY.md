# Security Policy

## Reporting a vulnerability

Email **hcc@hammurabicodingcompany.com** with "Security" in the subject line.
Please include the affected version (Help -> About, or `perpetua config`),
steps to reproduce, and the impact you observed. Do not open a public GitHub
issue for a vulnerability.

We will acknowledge a report when we are able and aim to fix confirmed issues
in the next release. We do not run a bug-bounty programme and do not promise a
response time.

## Supported versions

Only the latest released 1.x version of the Perpetua desktop app receives
security fixes.

## Scope

In scope: the Perpetua desktop app (`desktop/`), the companion browser
extension (`browser-extension/`), and the purchase-notification worker
(`polar-webhook/`).

Out of scope: vulnerabilities in third-party services (Polar, WebDAV
providers, mail providers) and issues that require an already-compromised
device or operating-system account. Note that the local vault is not yet
encrypted at rest; this is documented in `desktop/legal/PRIVACY.md` and
tracked in `desktop/docs/AT-REST-ENCRYPTION-PLAN.md`.
