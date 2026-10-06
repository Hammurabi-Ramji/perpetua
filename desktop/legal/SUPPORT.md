# Perpetua — Support

| Channel | Detail |
|---------|--------|
| Product | Perpetua (desktop Lifetime License Manager) |
| Publisher | Hammurabi Coding Company, LLC |
| Package id | `com.perpetua.app` |
| Version (in-tree) | 1.0.0 |
| Support email | support@hammurabi.click |
| Legal / privacy | support@hammurabi.click (subject line: "Privacy") |
| Product page | <https://perpetua.hammurabi.click> |
| Docs | `desktop/README.md`, `desktop/docs/USER_GUIDE.md`, `desktop/docs/TROUBLESHOOTING.md` |

Only one mailbox is listed on purpose: it is the one that is monitored. Do
not add a second address here unless it is also actually read.

## Before contacting support

1. Note your OS version and Perpetua version (Help → About Perpetua).
2. Confirm whether the issue is vault data, keep-alive reminders, or Pro
   activation (Polar vs offline key).
3. Attach the diagnostics log if the app failed to start or a reminder /
   email did not go out: `%APPDATA%\perpetua\perpetua.log` on Windows
   (`~/Library/Application Support/perpetua/perpetua.log` on macOS,
   `~/.local/share/perpetua/perpetua.log` on Linux). It contains timestamps
   and error messages only — never license keys, passwords or vault
   contents.
4. Prefer exporting a **redacted** vault sample (remove license keys) if
   asked to reproduce a data issue.

## Polar purchases

Pro is sold through Polar.sh, which acts as Merchant of Record (they handle
tax/VAT, payment processing, and refunds). Activation uses the Polar
organization configuration baked in at release build time. If activation
fails, include the Polar order reference (not the full license key) when
emailing support.

Refund requests go through Polar's customer portal link in your purchase
email; if that doesn't work, email support with the order reference.
