# Perpetua — Testing, Error Handling & QA Reference

This document catalogs the full quality picture for **Perpetua** — the local-first
desktop app (Tauri + SvelteKit + Rust + SQLite), the edition being taken to
market. (The source folder is still named `LtLMA`, the original codename.)

---

## 1. Quality gates (commands)

Run from the project root:

| Gate                          | Command                      | Status (re-run 2026-07-19)     |
| ----------------------------- | ---------------------------- | ------------------------------ |
| Rust unit + integration tests | `cd src-tauri && cargo test` | ✅ 21/21 (incl. vendor policy) |
| Frontend unit tests (Vitest)  | `npm run test`               | ✅ 11/11                       |
| Browser E2E (Playwright)      | `npm run test:e2e`           | ⏸ not re-run this pass         |
| TypeScript / Svelte typecheck | `npm run check`              | ✅ 0 errors / 0 warnings       |
| Lint (Prettier + ESLint)      | `npm run lint`               | ⏸ not re-run this pass         |
| Spell check (cspell)          | `npm run spell`              | ⏸ not re-run this pass         |
| Markdown lint (markdownlint)  | `npm run lint:md`            | ⏸ not re-run this pass         |
| Production build              | `npm run build`              | ✅                             |
| Desktop bundle (with Polar)   | `./build-release.ps1`        | see `docs/RELEASE.md`          |

---

## 2. Rust tests (`src-tauri/src/tests.rs`)

Sixteen tests covering services (direct) and the HTTP API (via `tower::oneshot`).

### Service-level

- `services_persist_auth_and_license_crud` — register/login, create, update,
  fetch, delete; verifies persistence and that delete empties the vault.
- `stats_and_reminders_cover_expiry_and_action_deadlines` — active/expiring/
  expired counts and the reminder queue (expiry + action deadlines). Unlocks Pro
  first so the 4-license scenario isn't blocked by the free cap.
- `free_tier_caps_licenses_until_pro_unlock` — adds up to the free limit, asserts
  the next add fails, rejects a bad key, then activates a minted key and confirms
  unlimited adds. The core monetization test.
- `import_export_round_trip_skips_duplicates_and_preserves_csv_notes` — JSON/CSV
  export → import, duplicate skipping, and multiline-note fidelity through CSV.
- `invalid_import_is_all_or_nothing` — a malformed row aborts the whole import
  (transactional); the vault stays empty.
- `backup_rotation_keeps_only_recent_db_files_and_preserves_other_files` — keeps
  the 5 most recent `.db` backups, leaves non-db files untouched.
- `background_notifications_fire_for_due_items_and_dedupe_per_day` — the
  background maintainer: items due within 7 days notify, items further out don't,
  and a second pass the same day sends nothing (once-per-day dedupe).
- `keepalive_flags_inactive_licenses_and_mark_active_resets` — a license with a
  `keepalive_days` cadence whose last activity is stale surfaces an overdue
  keep-alive reminder; "mark as used" resets the clock so it's no longer overdue.
  This is Perpetua's core "don't lose a lifetime license to inactivity" feature.
- `keepalive_prompts_proactively_before_revocation` — a 90-day cadence last used
  70 days ago prompts now, ~3 weeks before the real revocation (safety margin).
- `polar_disabled_by_default_and_parses_activation_response` — confirms Polar is
  off without a build-time org id (so tests stay offline/hermetic) and that a
  Polar activation JSON deserializes into our model.

### HTTP-level (full request → router → response)

- `auth_me_route_requires_valid_bearer_token` — 401 without a token, 200 + user
  body with a valid bearer token.
- `paywall_flow_blocks_at_cap_and_unlocks_after_activation` — the end-to-end
  money path over HTTP: register → 3× `201` → 4th `402` → `/api/entitlement`
  shows `remaining: 0` → `/api/activate` with a minted key `200 pro:true` →
  previously-blocked add now `201`.
- `validate_credentials_rejects_bad_input` — short passwords and malformed emails
  are rejected at the service layer.
- `register_route_rejects_weak_credentials_and_duplicates` — over HTTP: weak
  password `400`, bad email `400`, valid `201`, duplicate email `400`.
- `license_crud_over_http` — create `201` → patch update `200` → delete `200` →
  fetch deleted `404`, all through the router.
- `keepalive_mark_active_over_http` — a stale keep-alive surfaces as overdue via
  `/api/reminders/items`, and `POST /api/licenses/:id/active` clears it.

---

## 3. Frontend tests (Vitest, `tests/`)

- `vault.test.ts` (2) — vault tools page behavior.
- `page.test.ts` (1) — dashboard render.
- `license-form.test.ts` (1) — license form component.
- `entitlement.test.ts` (2) — `handleAddError` opens the paywall on `402` and
  ignores other errors.
- `license-normalize.test.ts` (2) — keep-alive cadence string → number, blanks →
  null.
- `dossier.test.ts` (3) — the per-license dossier generator: all four sections,
  slugged filename, fields filled from the record, graceful degradation.

Run with `npm run test` (jsdom environment). Vitest is scoped to `tests/**` so it
doesn't pick up the Playwright specs in `e2e/`.

---

## 4. Error handling

### Backend (Rust / Axum)

Every handler returns a structured `ApiResponse { success, data, message }` with
an explicit HTTP status:

- Auth: missing/invalid/expired token → `401`; bad credentials → `401`;
  duplicate registration → `400`. Registration is validated server-side
  (`validate_credentials`): email must contain `@`, password ≥ 8 chars — the API
  can't be bypassed by a client that skips the form checks.
- Free-tier cap: a typed `FreeLimitReached` error is downcast in the handler and
  mapped to **`402 Payment Required`** (both single add _and_ bulk import).
- Validation: license payloads are sanitized; bad dates / missing required fields
  → `400` with a human message.
- Import: malformed content → `400`; the import runs in a transaction so it is
  all-or-nothing.
- Activation: invalid/forbidden/not-found keys → `400` with a specific message.
- Everything else: unexpected failures → `500` with a safe message (no internal
  details leaked).

### Frontend (SvelteKit / TS)

- `ApiError` (in `src/lib/api.ts`) carries the HTTP `status`, so callers can
  branch on it.
- `handleAddError()` (in `src/lib/stores/entitlement.ts`) detects `402` and opens
  the upgrade paywall instead of showing a raw error — wired into all three
  add/import paths (dashboard, licenses, vault import).
- Every page action (load/create/import/activate) is wrapped in try/catch and
  surfaces a user-facing banner on non-paywall errors.

---

## 5. Fallbacks

- **Polar not configured → offline keys.** If `POLAR_ORGANIZATION_ID` isn't baked
  in (dev/test builds), activation falls back to self-issued HS256 keys
  (`verify_pro_key`). This keeps the test suite and headless QA fully offline.
  Verify with `perpetua config` (prints ENABLED/DISABLED).
- **Polar network/transport failure** → mapped to a clear `400` message
  ("Could not reach the licensing server…") rather than a crash.
- **Entitlement load failure** → the shared store falls back to `null`; the plan
  banner simply doesn't render (no broken UI).
- **License secret override** → `LICENSE_VERIFY_SECRET` reads
  `option_env!("PERPETUA_LICENSE_SECRET")` with an embedded default, so it can be
  rotated at build time without code changes.
- **Local data dir override** → `PERPETUA_DATA_DIR` / `perpetua serve <dir>` lets the
  app run against a throwaway vault.
- **Backups** are rotated (keep 5) and never touch non-db files.

---

## 6. Polar activation testing

- **Offline (default dev/test):** mint a key with `perpetua mint-key <ref>` and
  activate it; no network required.
- **Online (production):** build via `./build-release.ps1` (bakes the org id).
  Activation calls Polar's public `POST /v1/customer-portal/license-keys/activate`
  — no secret shipped.
- **Sandbox dry-run:** set `POLAR_API_BASE` to the Polar sandbox at build time to
  test the full purchase → key → activate loop without real money. Pair with a
  **100%-off discount code** in the Polar dashboard.

---

## 7. Manual / headless QA

Helper subcommands on the binary:

- `perpetua serve [data-dir]` — runs the Axum API headlessly (no desktop window) for
  scripted QA against a throwaway vault.
- `perpetua config` — prints whether Polar activation is enabled in this build.
- `perpetua mint-key <ref>` — prints an offline Pro key (dev/fulfillment helper).
- `perpetua check-reminders [data-dir]` — runs the background maintainer's
  due-detection once and prints what it would notify (and marks them notified).
  Verifies the maintainer without a GUI.

The background maintainer (autostart + system tray + 6-hour scheduler + native
OS notifications) is wired in `main.rs` and compiles; its detection/dedupe core
is unit-tested and verified headlessly via `check-reminders`. The visual pieces
(window, toast, tray, login registration) require running the desktop bundle to
confirm on a real desktop.

A full HTTP walkthrough (register → 3 adds → `402` → bad key rejected → activate →
unlimited → final stats) has been run and passes end-to-end.

---

## 8. Playwright (E2E)

**Perpetua (Perpetua) has a real browser E2E** at `e2e/paywall.spec.ts`, run with
`npm run test:e2e`. It drives a live stack — the config starts two web servers:
the headless Axum API (`perpetua serve .e2e-data`, a throwaway vault) and the
SvelteKit dev server (bound to `127.0.0.1`). The test then drives Chromium
through the full money path against the **real backend** (no mocks):

> register → land on dashboard (free plan) → add 3 licenses (banner counts up) →
> 4th add opens the upgrade paywall → paste a minted key + Activate → banner
> flips to Pro → previously-blocked add now succeeds.

Prereq: build the Rust binary first (`cd src-tauri && cargo build`); the config
references `src-tauri/target/debug/perpetua`. The backend runs offline (no Polar org
id), so the test mints its own key via `perpetua mint-key`.

---

## 9. Known gaps

- **Code signing** — the Tauri installer is unsigned; an **EV** certificate is
  required to avoid Windows SmartScreen warnings at install.

---

## 10. Suggested CI gate

```sh
cd Perpetua
npm ci
npm run lint
npm run lint:md
npm run spell
npm run check
npm run test
cd src-tauri && cargo build && cargo test
cd .. && npx playwright install --with-deps chromium && npm run test:e2e
```
