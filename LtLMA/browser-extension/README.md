# Perpetua Companion (browser extension)

Captures lifetime-deal license purchases from AppSumo, Product Hunt, StackSocial, and Humble Bundle and adds them to your local Perpetua vault.

Originally built for a different, now-retired hosted product (LicenseVault/LtLM). Ported to talk to Perpetua's local API — see `SSOT.md` at the repo root for that history.

## Load it (unpacked, for development)

1. `cd browser-extension && npm install` (only needed once, for tests)
2. In Chrome/Edge: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this `browser-extension/` folder.
3. Open the extension's **Options** page (right-click the toolbar icon → Options, or via the popup's Settings button).
4. In Perpetua itself, open **Vault Tools → Browser extension → Reveal token for extension**, copy it.
5. Paste that token into the extension's Options page, save.
6. Visit a supported deal-site account page (e.g. `appsumo.com/account`) with a lifetime purchase — it should sync automatically after a couple of seconds. Check the extension's popup for recent licenses, or the browser's Notifications.

## How it works

- Content scripts only scrape the page's DOM — they never hold the auth token or call `fetch()` directly. They message the background service worker with what they found; the background worker is the only place that talks to Perpetua's API (`background.js`/`lib/api.js`).
- Sync is a `POST /api/vault/import` call — the same endpoint Vault Tools' own JSON import uses. **A free-tier cap hit rolls back the whole batch, not a partial one** (Perpetua's import runs in one transaction) — if you see "0 licenses synced, free-tier limit reached," that's expected, not a bug.
- The token lives in `chrome.storage.local` (not `.sync`) — it's a real Perpetua session credential, so it deliberately never syncs through your Chrome/Google account.

## Known v1 limitations

- **Non-default API port isn't supported without repacking.** Perpetua's API port is only configurable at build time (`VITE_PERPETUA_API_PORT`). The extension's `manifest.json` `host_permissions` is hardcoded to the default `http://127.0.0.1:18765` — a browser extension can only fetch hosts it declared permission for, and that list is static in the manifest. If you built Perpetua with a non-default port, you'd need to edit `manifest.json` and reload the unpacked extension.
- **Token expires in 30 days**, same as any Perpetua login session — there's no separate, more-revocable credential type for the extension yet. Re-copy a fresh one from Vault Tools when syncing stops.
- **DOM selectors will break when a deal site redesigns its account page.** This is inherent to scraping and can't be avoided from source alone — if sync stops finding anything on a site you use, the selectors in that site's `content-scripts/*.js` likely need updating.
- **No "add from selected text" yet.** The original prototype had a right-click "add to vault" context-menu action targeting an endpoint that was never actually built. Worth adding properly against `POST /api/licenses` as a fast-follow, not included in this port.
- **No in-extension "open Perpetua" button.** A browser extension can't launch a native desktop app window — opening a browser tab wouldn't do anything useful for a packaged Tauri app, so that button was removed rather than left pointing at nothing.
