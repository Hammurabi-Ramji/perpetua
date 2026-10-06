# PERPETUA

Local-first lifetime license manager.

**Perpetua** — [`LtLMA/`](./LtLMA/) — Desktop app (Tauri 2 + SvelteKit + Rust/Axum + SQLite), plus a companion browser extension ([`LtLMA/browser-extension/`](./LtLMA/browser-extension/)) that captures license purchases from deal sites straight into your local vault. Pro unlocks encrypted cloud backup/restore to your own WebDAV storage, so a lost machine doesn't mean a lost vault.

**Version:** 1.0.0 (`LtLMA/`)

## Quick start

```powershell
cd LtLMA
npm ci
npm run tauri dev
```

### Release build

```powershell
cd LtLMA
npm ci
.\build-release.ps1
```

Produces `perpetua.exe` plus MSI/NSIS under `LtLMA\src-tauri\target\release\`.
Details: [`LtLMA/docs/RELEASE.md`](./LtLMA/docs/RELEASE.md) · smoke: [`LtLMA/docs/SMOKE_TEST.md`](./LtLMA/docs/SMOKE_TEST.md)

### Using Perpetua

- [`LtLMA/docs/USER_GUIDE.md`](./LtLMA/docs/USER_GUIDE.md) — features, walkthroughs
- [`LtLMA/docs/TROUBLESHOOTING.md`](./LtLMA/docs/TROUBLESHOOTING.md) — common issues
- [`LtLMA/docs/STATUS.md`](./LtLMA/docs/STATUS.md) — what works, what doesn't yet, what's next

## Legal

- Root [`LICENSE`](./LICENSE) — proprietary commercial terms
- Product pack: [`LtLMA/legal/`](./LtLMA/legal/) — Privacy, Terms/EULA, Support

## CI

- Quality gates: [`.github/workflows/perpetua-ci.yml`](./.github/workflows/perpetua-ci.yml)
- Release builds: [`.github/workflows/release.yml`](./.github/workflows/release.yml)

## Marketing and response security

`marketing/landing.html` is a static marketing source, **not** the deployed
React/Webdev application currently serving `perpetua.hammurabi.click`.
Updating this file or `nginx/nginx.conf` does not change that live site's
responses. Deploy the equivalent metadata, accessible markup, checkout copy,
and security headers through the live project's hosting configuration. The
regular one-time Polar price is $49.99 USD; the automatic Early Bird promotion
showed a $19.99 checkout total before location-specific tax on October 5, 2026.
Promotions can expire, so the Polar checkout is authoritative for the final
price. The desktop upgrade dialog uses the live checkout link instead of a
placeholder URL.

For the optional Nginx deployment, copy `nginx/security-headers.conf` to
`/etc/nginx/security-headers.conf` alongside `nginx/nginx.conf`, run
`nginx -t`, and reload. The localhost HTTP listener deliberately does not send
HSTS; enforce HTTPS/HSTS at the public TLS edge. Verify CSP,
Permissions-Policy, Referrer-Policy, X-Frame-Options and X-Content-Type-Options
on the **actual public response**, including error and static-file paths.
The live Webdev site requires its own CSP integration (including any platform
injected scripts); do not paste this Nginx policy into that host untested.

## Hygiene

- `oracleJdk-26/` is **not** product code; exclude from distribution archives.
- Local `*.db` / `.env*` may contain secrets — do not publish.

## Status

See [`LtLMA/docs/STATUS.md`](./LtLMA/docs/STATUS.md) for what works, what
doesn't yet, and what's next as of the current release.
