# Keep-Alive Phases 2-3 - Spec and Plan

| | |
|---|---|
| **Status** | PLAN ONLY. No implementation is authorized by this document. |
| **Scope** | Keep-alive Phase 2 (Activity inference) and Phase 3 (Auto-Maintain, Pro) from `KEEPALIVE-ROADMAP.md` |
| **Gap addressed** | `docs/internal/PROJECT-STATUS-AUDIT.md` (git-ignored working paper) section 6: "Keep-alive Phases 2-3 - Low for MVP - Explicitly out of MVP / gated Pro" |
| **Written** | 2026-10-06, against branch `feature/polar-webhook` (code read, not executed) |
| **Label key** | **Built** = exists in code and is exercised by tests. **Specified** = written down in docs/legal but no code. **Aspirational** = idea or intent with no concrete spec. |

Nothing here changes the MVP definition (SSOT Phase 7: "Keep-alive MVP = Phase 0
reminders + mark-active + Phase 1 vendor policies, not Auto-Maintain"). Phases
2-3 stay out of MVP and Phase 3 stays gated and opt-in.

---

## 1. Where things are defined

| Topic | Location |
|---|---|
| Phase 0-4 definitions (the only place Phases 2 and 3 are specified) | `desktop/docs/KEEPALIVE-ROADMAP.md` (Phase 2 lines 57-69, Phase 3 lines 73-89) |
| Phase 1 implementation | `desktop/src-tauri/src/vendor_policy.rs`, `desktop/src-tauri/data/vendor-policies.json`, routes in `api.rs:137-138`, UI in `desktop/src/lib/components/LicenseForm.svelte` |
| Phase 0 implementation | `services.rs:758-793` (reminder kind `keepalive`), `services.rs:624` (`mark_license_active`), `api.rs:121` (`POST /api/licenses/:id/active`), `main.rs:288-317` (`spawn_reminder_scheduler`), `database.rs:114-115,131,198-199` |
| "Out of MVP" decision | `docs/internal/SSOT.md` lines 65, 179, 193, 210; `docs/internal/PROJECT-STATUS-AUDIT.md` lines 123, 141 |
| Auto-Maintain teaser UI | `desktop/src/routes/reminders/+page.svelte:384-404` |
| Legal hooks | `legal/TERMS.md` section 3 and section 5; `legal/PRIVACY.md` (no Phase 2/3 data flows listed) |
| Not-built statement | `docs/STATUS.md:65-67` ("Auto-Maintain is a placeholder... deliberately not built") |
| Related audit findings | `docs/internal/PERPETUA_SOTA_AUDIT_AND_ACTUARIAL_ANALYSIS.md` BIZ-09 (teaser records nothing), LEG-08 (ToS risk of scraping and Auto-Maintain logins); open items tracked in `docs/REMAINING_TASKS.md` |

## 2. What Phases 2 and 3 are per the existing docs

**Phase 2 - Activity inference** (roadmap status: "planned"; label: **Specified**, thin)
- Goal: reduce manual "mark as used" by detecting real activity signals.
- Deliverables, "pick lowest-risk first": (a) browser companion that pings Perpetua when the user visits a tracked vendor and auto-resets that license's clock; (b) optional inbox signal that detects vendor "we miss you / account inactive" emails to raise urgency.
- Risks named: privacy, scope creep. Mitigation: opt-in, local-first, store only a timestamp.
- Exit: a license clock can reset without a manual click; manual button stays the default.
- Not specified: Pro vs free, data model, how a "visit" maps to a license, how it is distinguished from a real login, how the extension authenticates for this purpose.

**Phase 3 - Auto-Maintain (Pro)** (roadmap status: "gated future tier"; label: **Specified**, with explicit risks)
- Goal: Perpetua performs the periodic login itself.
- Deliverables: OS-keychain credential vault (never in SQLite); per-vendor login adapters plus headless session runner; audit log of every automated action with per-license opt-in; Pro gating "reusing the existing Polar activation seam".
- Risks named: credential liability, vendor ToS, 2FA/CAPTCHA breakage, per-vendor fragility; downgrade to Phase 0 reminders on any failure.
- Exit: for one supported vendor, a license survives an inactivity window with no user action, and any failure downgrades to a reminder.
- Legal: `TERMS.md` section 3 says Auto-Maintain is "not included unless explicitly sold and enabled"; section 5 says it "requires separate opt-in and may be subject to additional terms".

**Phase 4** (reliability/telemetry/multi-device) is out of scope here but is named by the roadmap as the gate on Phase 3 maturity; see dependencies in section 8.

## 3. Current state (labelled)

| Capability | Label | Evidence / note |
|---|---|---|
| Per-license `keepalive_days`, `last_active` columns + migration | **Built** | `database.rs:114-115`, `198-199` |
| `keepalive` reminder with proactive lead (`max(7d, days/4)`) | **Built** | `services.rs:758-793`, `805-809`; tests `tests.rs:162`, `tests.rs:205` |
| Background scheduler (first run 15 s after launch, then every 6 h), once-per-day dedupe, OS notification, autostart + tray | **Built** | `main.rs:288-317`, `services.rs:848-887` |
| Manual "Mark as used" | **Built** | `services.rs:624`, `api.rs:714`, test `tests.rs:520` |
| Phase 1 dataset (7 entries) + matcher + API + form autofill + drop-in override file | **Built** | `vendor_policy.rs`, `vendor-policies.json`, `tests.rs:715`, 4 unit tests in `vendor_policy.rs`, Vitest `license-form.test.ts` |
| Pro entitlement flag (install-wide `app_state.pro`), Polar activate, offline HS256 key | **Built** | `services.rs:395-487`, `polar.rs`, `api.rs:657-689` |
| Pro-feature gate pattern (service layer returns "X is a Pro feature") | **Built** (for sharing and cloud backup) | `services.rs:1118`, `1579`, `1628`; free cap `services.rs:519` -> HTTP 402 |
| OS-keychain secret store (SMTP, WebDAV password, backup key), per-user key | **Built** | `secret_store.rs` (services: `SMTP`, `WEBDAV_PASSWORD`, `BACKUP_KEY`) |
| Browser companion extension (captures purchases, `POST /vault/import` only) | **Built** | `browser-extension/` (manifest v3, 4 marketplace account pages) |
| Auto-Maintain teaser card | **Built (stub)** | `reminders/+page.svelte:384-404`. "Notify me" only sets a local `interested = true`; nothing is saved or sent, yet the UI says "You're on the list" (BIZ-09) |
| Visit-based clock reset (Phase 2a) | **Aspirational** | Extension never calls `/api/licenses/:id/active`; no activity-signal endpoint |
| Inbox signal (Phase 2b) | **Aspirational** | No mail-read code anywhere. `mail.rs` is send-only SMTP |
| Credential vault for vendor logins, adapters, runner, audit log (Phase 3) | **Aspirational** | None in tree. Only the generic keychain primitive exists |
| Phase 3 Pro gate for the feature itself | **Aspirational** | Gate pattern exists; no Auto-Maintain feature to attach it to |
| Phase 4 retries/telemetry/multi-device | **Specified** | Roadmap only. Cloud backup is single-object overwrite, not sync (`STATUS.md:72-74`) |

### Doc-vs-code conflicts and drift found

1. **Teaser vs reality (BIZ-09).** UI claims "You're on the list" but records nothing and there is no server or email capture. Either remove the button or implement a real, consented opt-in before any Phase 3 marketing.
2. **STATUS.md vs ROADMAP tone.** `STATUS.md:65-67` says Auto-Maintain is "deliberately not built" because it would mean storing vendor credentials and driving a browser; the roadmap describes exactly that as the Phase 3 plan. Reconcile via an ADR (task T0) rather than silently building.
3. **Roadmap says Phase 3 reuses "the existing Polar activation seam".** True only for activation. Pro is a one-shot flag (`app_state.pro = "1"`); `polar_activation_id` is stored but the key is never re-validated against Polar (`polar.rs` has only `activate`). Offline HS256 keys are forgeable if the binary is reversed (comment at `services.rs:41-45`). Acceptable for a cloud-backup perk; weaker for a feature with liability attached.
4. **Roadmap Phase 2a says the "browser companion pings Perpetua when the user visits a tracked vendor".** A companion exists, but it is import-only, scoped to four *marketplace* pages, and holds a full 30-day, non-revocable session JWT (`browser-extension/README.md`, `STATUS.md:69-71`). The ping channel does not exist.
5. **Phase 1 dataset is keyed by marketplace, not by the software vendor that actually revokes.** Roadmap Phase 1 calls it "vendor inactivity windows"; entries are AppSumo / StackSocial / Humble / Product Hunt / PitchGround / Dealify plus a generic rule. Six of seven entries are `confidence: low`; `last_verified` is 2026-07-01 (about 3 months before this doc). Phase 2/3 both need a *product-vendor domain*, which the schema lacks.
6. **Matcher substring defect (found by inspection, not executed).** `vendor_policy.rs:104` matches when `site.contains(alias) || alias.contains(site)` on normalized text. The alias `"ph"` (Product Hunt) would match any source site containing "ph" (e.g. "Alpha Tools"), and short aliases like "sumo" behave similarly. No test covers it. Fix before Phase 2 builds on it.
7. **Silent no-reminder case.** If a license has `keepalive_days` but neither `last_active` nor `purchase_date`, `get_reminder_items` emits nothing (`services.rs:759-764`) with no warning. Inferred activity would make this worse.
8. **Dataset override loaded once per process, no schema/signature check, silent fallback on parse error** (`vendor_policy.rs:45-63`). Fine for MVP; not fine as the trust root for automation targets.
9. **Vendor-policy endpoints are unauthenticated** (`api.rs:313-322` take no auth). Localhost-only and CORS-limited, so low risk, but note for any new endpoint conventions.
10. **Test-count drift.** SSOT/Audit record "cargo 21/21" (2026-07-19); grep finds about 31 Rust test attributes now (24 in `tests.rs`, 4 in `vendor_policy.rs`, 3 in `cloud_backup.rs`). Update evidence when re-run.
11. **Email reminders toggle is a no-op** (`STATUS.md:60-61`); relevant because Phase 3 failure downgrades "to reminders" and today only desktop notifications are delivered.

## 4. Gaps to close (summary)

| # | Gap | Blocks |
|---|---|---|
| G-A | No activity-signal data model (source, timestamp, confidence) distinct from manual `last_active` | 2a, 2b, 3 |
| G-B | No product-vendor domain on licenses or in the dataset | 2a, 3 |
| G-C | No narrowly-scoped, revocable token for the extension (full 30-day JWT, no revocation) | 2a |
| G-D | No decision on Phase 2 tier (free vs Pro) | 2 |
| G-E | No vendor-credential keyring namespace (current secrets keyed by user id only) | 3b |
| G-F | No isolated browser runtime for automation; no runner/scheduler for it | 3 |
| G-G | No audit-log table or UI | 3 |
| G-H | Pro gate is install-wide, one-shot, forgeable offline key; no feature-level gate helper | 3 |
| G-I | No per-vendor ToS review record | 3 |
| G-J | PRIVACY/TERMS lack Phase 2/3 data-flow rows and the separate Auto-Maintain terms promised in TERMS section 5 | 2, 3 |
| G-K | No success definition for "login counted as activity by the vendor" (a page load may not reset the vendor's clock) | 3 |

## 5. Proposed architecture

### 5.1 Shared foundation (both phases)

- **Activity model.** Keep `licenses.last_active` as the *manual / authoritative* date. Add `license_activity(id, license_id, observed_on DATE, source TEXT CHECK(source IN ('manual','extension','email','automation')), confidence TEXT, created_at)`. The keepalive baseline in `get_reminder_items` becomes `max(last_active, latest trusted signal, purchase_date)`, where "trusted" is controlled per license (`activity_trust` column: `manual_only` | `inferred_ok`). Migration follows the existing `ALTER TABLE ... ADD COLUMN` pattern in `database.rs:198-199`; new tables use `CREATE TABLE IF NOT EXISTS`.
- **Product-vendor domain.** Add optional `vendor_domain` to licenses (derive from `product_url` / `redemption_url` host, user-editable) and `domains[]` to dataset entries. Marketplace policies remain as defaults; domain match decides *where activity counts*.
- **Pro feature gate.** Add one helper, e.g. `require_pro(conn, "Auto-Maintain")`, wrapping `is_pro` and returning the same style of error as `services.rs:1118/1579`, mapped to HTTP 402 in `api.rs` (as the free-cap error already is). The front end keeps using `$entitlement?.pro`. **The gate must be enforced in the service layer and again inside the runner/scheduler**, not only in the UI.
- **Kill switch / dark ship.** A Cargo feature `auto_maintain` (off by default, like `fulfillment` in `Cargo.toml:69`) plus a runtime setting, so Phase 3 code can merge without shipping.

### 5.2 Phase 2a - Browser visit signal (recommended first)

- Extension keeps its content-script-only-scrapes / background-only-talks-to-API rule (`background.js` header).
- New **scoped token**: `POST /api/extension/token` issues a JWT with `scope: "activity"` that can only call `POST /api/activity/signal`. Requires bumping a per-user `token_version` (already on the STATUS "what's next" list) so tokens can be revoked. The existing full-scope token stays for import until replaced.
- Extension fetches the list of tracked **hosts** (no keys, no names beyond what is needed), then does **matching locally**. On a visit to a matching host it sends only `{license_id, observed_on}` (date, not URL, not title, not path). Perpetua never receives browsing history.
- Host access via `optional_host_permissions` requested per vendor domain at opt-in time, not broad `<all_urls>`, to stay inside Chrome Web Store minimal-permission and limited-use rules. This replaces the static-manifest limitation noted in the extension README only for hosts the user chooses.
- A visit is a **weak** signal (the page may be a logged-out marketing page). Rules: only count visits to the product's own app/dashboard path patterns declared in the dataset (`activity_paths`), or visits where the content script detects a logged-in marker declared per vendor; everything else is ignored. Source is stored, shown in the UI ("auto-detected visit, 12 Sep"), and a one-click "Not a real login" undo is provided.
- Marketplace visits (e.g. AppSumo account page, already scraped) **never** reset a product license's clock, because the marketplace is not the revoker.

### 5.3 Phase 2b - Inbox signal (recommend defer; spike only)

- Requires reading the user's mailbox (IMAP with app password in keychain, or OAuth), which directly conflicts with "never store more than a timestamp" and is the largest privacy surface in the roadmap. Perpetua has no mail-reading code today.
- If pursued: opt-in per mailbox; read-only; local-only; match sender domain against the license's `vendor_domain` and subject against a small fixed pattern list; persist only `(license_id, date, 'email')`; never store subject/body/addresses; never send mail content anywhere. Output *raises urgency* only, never resets a clock.
- Label: **Aspirational**. Recommended decision: do the 1-day spike (T9) and ship nothing until D2 is answered.

### 5.4 Phase 3 - Auto-Maintain (Pro), staged

The roadmap's literal plan (stored credentials + per-vendor adapters + headless runner) carries the highest liability. Stage it so each step is shippable and reversible:

| Stage | Description | Credentials stored? | Risk |
|---|---|---|---|
| **3.0 Assisted login** | One click opens the license's `redemption_url`/`vendor_domain` in the default browser (`shell:allow-open` is already granted in `capabilities/default.json`); a "I logged in" confirmation writes a `manual` activity row. | No | Minimal. No ToS exposure. Candidate for free tier. |
| **3a Session keep-warm** | User logs in **once, interactively**, inside a Perpetua-managed webview with an *isolated profile directory per vendor*. Scheduled runs reload a vendor-declared "authenticated landing" URL in that profile and verify a logged-in marker. No password is ever seen or stored by Perpetua; only the webview's own cookie jar, which sits under the app profile. | No (session cookies only, in webview profile) | Medium: it is still automated access; sessions can expire and need a human re-login (that is the designed fallback). |
| **3b Credential adapters** | Per-vendor adapters fill stored credentials (OS keychain only) and drive the login. | Yes | High: credential liability, 2FA/CAPTCHA, anti-bot. **Only for vendors with written permission or an official API, no CAPTCHA, no 2FA.** Not planned for any vendor until D3/D4 are answered. |

Common components for 3a/3b:
- **Runner**: new tokio task modelled on `spawn_reminder_scheduler` (`main.rs:288`), concurrency 1, per-vendor jitter and minimum interval (at least 24 h, in practice once per `keepalive_days/4`), exponential backoff, global pause when the app is on battery-saver/offline. Never runs unless Pro **and** per-license consent **and** feature flag.
- **Webview isolation**: automation windows get **no Tauri capability** attached (do not reuse `capabilities/default.json`), so remote vendor pages cannot reach IPC. Add a CSP/permission review; the current `tauri.conf.json` CSP only allows the local API and `api.polar.sh`. Whether a hidden webview with a per-vendor data directory is viable on all three desktop platforms must be proven in spike T14 before any commitment.
- **Credentials (3b only)**: extend `secret_store.rs` with a new service constant (e.g. `com.perpetua.app.vendor-cred`) keyed by `{owner_id}:{license_id}` since current keys are by user id only. Never in SQLite, never in exports/dossiers/cloud backup (verify `export_*`, `dossier.ts`, and the encrypted backup payload exclude keyring data by construction). Zeroize in memory after use.
- **Audit log**: `automation_runs(id, owner_id, license_id, adapter, started_at, finished_at, result CHECK(result IN ('ok','needs_user','failed','skipped')), reason_code, vendor_host)`. No page content, no URLs with query strings, no credentials, no cookies. Viewable and exportable in the UI; retention default 180 days.
- **Success semantics (G-K)**: a run writes an `automation` activity row only when the logged-in marker is verified; it **never** sets the authoritative `last_active`. Until a user manually confirms the vendor still honors the license after one full cycle, the Phase 0 reminders keep firing at normal urgency (Perpetua must not create false confidence). Any failure sets `result='needs_user'` and raises a normal keepalive notification (the downgrade the roadmap requires).
- **Consent**: per-license toggle plus one-time global consent screen quoting the separate Auto-Maintain terms; consent timestamp stored.

## 6. Pro-gating approach (existing mechanism)

Use what exists; do not invent a second licensing system.

1. **Entitlement source**: `services::is_pro` (install-wide flag from `app_state`), set by `mark_pro_activated` after either `polar::activate` (when `POLAR_ORGANIZATION_ID` is baked in) or the offline HS256 key path (`api.rs:657-689`). `GET /api/entitlement` already exposes `pro` to the UI.
2. **Service-layer enforcement** via `require_pro` (section 5.1), identical in spirit to cloud backup (`services.rs:1579, 1628`) and sharing (`services.rs:1118`). 402 mapping in handlers.
3. **UI**: replace the teaser card with a real panel shown when `$entitlement?.pro`; for non-Pro, show the existing upgrade flow instead of the fake "Notify me".
4. **Runtime**: scheduler re-checks `is_pro` each cycle so a downgrade/reset stops automation.
5. **Feature granularity**: a single `pro` flag is sufficient for launch. If Auto-Maintain is sold as a separate add-on (TERMS section 3 allows "explicitly sold and enabled"), add an `entitlement.features: string[]` populated from a Polar benefit/product claim and gate on `features.contains("auto-maintain")`. Decision D5.
6. **Hardening dependency (recommended before charging for Phase 3)**: periodic Polar re-validation with an offline grace window (for example 30 days), and retire the embedded HS256 secret from release builds (already flagged in `services.rs:41-45`). The in-flight `feature/polar-webhook` work (webhook worker + discount endpoint) is related Polar plumbing but does not provide client-side re-validation; confirm before relying on it.
7. **Phase 2 tier**: roadmap is silent. Default proposal: 2a free (cheap, local, improves core value and retention), 2b Pro. Decision D1.

## 7. Risks

### 7.1 Vendor ToS and anti-abuse
- Automated logins and scripted session refresh may violate a vendor's terms and can trigger bot detection, account locks, or bans - harming the user's license, the very thing Perpetua is meant to protect. The audit rates this Medium (LEG-08).
- Mitigations: staged approach (5.4); no automation for any vendor without a recorded ToS review (task G0) and a per-vendor `automation_allowed` flag in the dataset; no CAPTCHA/2FA bypass, ever; human-like but conservative cadence; honor `robots`/rate hints; automatic suspend after any anti-bot signal (HTTP 403/429, CAPTCHA element) and flag the vendor for review.
- Phase 2a extension: Chrome Web Store single-purpose and limited-use policies; do not collect browsing history; request host permissions only per opted-in vendor.

### 7.2 Vendor policy accuracy and "login counts" risk
- The dataset is mostly low-confidence, marketplace-level, and 3 months stale. A wrong window under inference or automation silently under-protects.
- A page load or session refresh may not count as the activity a vendor measures (some require product use). Mitigation: verified-marker rule, no false-confidence rule (5.4), explicit UI copy "may not count as activity for every vendor", and TERMS disclaimer already stating no guarantee against revocation.

### 7.3 Privacy
- 2a: browsing-adjacent signal. Mitigate with local matching, date-only payload, per-vendor opt-in, undo, visible source.
- 2b: mailbox access - highest risk; deferred.
- 3: audit log and session cookies are sensitive. Isolated profile per vendor; no URLs with queries; retention limit; wipe-profile control; wipe on license delete.
- `PRIVACY.md` must add rows for each new data flow before release (it currently states there is no telemetry and lists exactly five flows). Phase 4 failure telemetry, if ever added, must be opt-in and content-free.

### 7.4 Security
- Credentials (3b): OS keychain only, per-license key, zeroize, never logged, never in exports/backups. Treat any change that makes cloud backup or dossier include them as a release blocker.
- The vault is not encrypted at rest (open P1-5). Session cookies and audit rows are only as safe as the profile directory; document it.
- Local API at `127.0.0.1:18765` is reachable by any local process/page; new endpoints require auth, tight CORS (`webview_cors_layer`), rate limiting (existing limiter pattern), and the scoped extension token.
- Remote vendor pages in a webview must have **no IPC capability** and no access to the Tauri API.
- Entitlement bypass via forged offline key (known) - revenue risk, not liability risk, but strengthens the case for Polar re-validation.
- Stateless 30-day JWTs with no revocation: a leaked extension token could post fake activity (suppressing real reminders). The scoped, revocable token (T5) addresses this.

### 7.5 Operational / product
- Per-vendor adapter fragility and ongoing curation cost (the roadmap's own concern); the extension's DOM selectors are already flagged as unverified against live markup (`STATUS.md:75-78`).
- Desktop app must be running for the runner; autostart/tray exist but are not guaranteed (user may quit).
- Vault sharing: Pro and automation are install-wide while data is per owner; consent and credentials must be keyed to the *owner* (`resolved_owner` in `api.rs`), and the scheduler already iterates all users (`all_user_ids`).

## 8. Acceptance criteria

**Phase 2a (visit signal)**
- A1. With the extension configured and consent given for vendor X, visiting X's authenticated area resets that license's computed baseline within one scheduler cycle, with no click; `license_activity` has one row with `source='extension'`.
- A2. Visiting a marketplace page (AppSumo etc.), a logged-out vendor page, or an unrelated site changes nothing and sends nothing to Perpetua.
- A3. Payload contains only `license_id` and a date (verified by test and by inspecting the extension network call).
- A4. Manual "Mark as used" still works and is the default for every license; `activity_trust` defaults to `manual_only` until the user enables inference.
- A5. User can see the source/date of the last activity and undo an inferred entry.
- A6. A revoked or expired scoped token is rejected (401) and cannot call any non-activity endpoint.
- A7. Disabling the feature removes host permissions and stops all signals.

**Phase 2b (only if D2 approves)**
- B1. Persists only `(license_id, date, 'email')`; no subject/body/address stored (schema test).
- B2. Can raise urgency, cannot reset a clock.
- B3. Mailbox credentials only in keychain; fully removable.

**Phase 3.0 / 3a / 3b**
- C1. Non-Pro users cannot enable automation: service returns 402-mapped error; UI shows upgrade; scheduler skips (tested for all three).
- C2. Automation runs only for licenses with recorded per-license consent and an enabled vendor adapter flagged `automation_allowed`.
- C3. Every run, including skips and failures, writes an audit row; no page content, cookies, or credentials appear in the log or in any export, backup, or dossier.
- C4. Any failure (login marker missing, CAPTCHA/2FA seen, 403/429, timeout, session expired) yields `needs_user` and a normal keepalive notification within the same cycle; no retry storms (bounded backoff).
- C5. For one pilot vendor, a license survives a full inactivity window with no user action **and** the user has confirmed the vendor still honors it (the roadmap exit criterion, made falsifiable).
- C6. Kill switch (setting + Cargo feature) fully disables the runner; deleting a license deletes its profile, credentials, consent, and audit rows.
- C7. Automation webviews have no Tauri IPC access (test via capability config review plus a probe page).
- C8. 3b only: credentials are retrievable only from the OS keychain, absent from SQLite, logs, exports, backups, and memory dumps after use (best-effort zeroize).
- C9. PRIVACY.md, TERMS addendum, USER_GUIDE and STATUS updated before release; teaser removed or made honest.

## 9. Test plan

Rust (`tests.rs` style, using the existing in-memory DB and `tower` HTTP harness):
- Baseline math: `max(last_active, signal, purchase_date)`; trust modes; inferred signal does not overwrite `last_active`; undo.
- `require_pro` returns 402 for non-Pro on every new route; scheduler skip when non-Pro.
- Scoped token: accepted on `/api/activity/signal`, 403/401 elsewhere; revocation via `token_version`; rate limit.
- Matcher: regression tests for the `"ph"` / short-alias substring defect and domain matching; marketplace never resets product license.
- Audit table: only allowed columns; retention purge; deletion cascade on license delete.
- Runner: use a local axum mock vendor (login page, authed page, 403/429, CAPTCHA page, slow response) to cover ok / needs_user / failed / backoff / jitter bounds / concurrency = 1.
- Secret store: per-license key isolation, delete on license delete, never present in export/backup/dossier output (grep-style assertions on produced payloads).
- Migration: existing vault upgrades cleanly (follow the existing ALTER-TABLE-ignore pattern).

Frontend (Vitest): Auto-Maintain panel states (non-Pro / Pro / consent / disabled), activity source display and undo, no fake "You're on the list" message.

Extension (Vitest, existing harness): local host matching, only date payload sent, optional-permission request flow, ignores marketplace and unmatched hosts, handles 401 by prompting re-pair, no history leakage.

E2E / manual: clean-machine smoke extended with "enable inference, visit vendor, clock resets"; Pro flow with Polar sandbox; 3a with a real low-risk test vendor account owned by the team; failure injection (network off, expired session). Record results in `docs/TESTING.md` and re-capture current test counts.

Security review: capability/CSP audit of automation webviews; threat-model note for the local API; dependency review for any browser-automation crate.

## 10. Ordered task breakdown and estimates

Estimates are engineering days for one developer, excluding external counsel time and calendar waits. Dependencies are in order.

| # | Task | Phase | Est. | Depends on |
|---|---|---|---|---|
| T0 | Decision records: D1 Phase 2 tier; D2 inbox signal go/no-go; D3 adopt staged Phase 3 (3.0, 3a, 3b) and reconcile STATUS.md vs roadmap; D4 pilot vendor + ToS posture; D5 single `pro` flag vs add-on feature. Update roadmap/STATUS text. | both | 0.5 | - |
| T1 | Fix teaser honesty (BIZ-09): remove "Notify me" or implement real opt-in with consent. | pre | 0.5 | T0 |
| T2 | Phase 1 hardening: matcher fix + tests; add `vendor_domain` and optional `activity_paths` to dataset schema; dataset refresh/verification process; flag stale entries. | pre | 2 | - |
| T3 | Schema: `license_activity`, `activity_trust`, optional `vendor_domain`; migrations + tests. | 2 | 1 | T2 |
| T4 | Services: baseline calculation, trust modes, undo; unit tests; fix silent no-baseline case. | 2 | 1 | T3 |
| T5 | Auth: `token_version` revocation + scoped activity token + `POST /api/activity/signal` + rate limit + tests. | 2 | 2 | T3 |
| T6 | Extension 2a: tracked-host fetch, local matcher, optional host permissions, background signal call, options UI, Vitest. | 2 | 3 | T5 |
| T7 | UI: activity source/undo on license detail, per-license trust toggle, Phase 2 setting + privacy copy. | 2 | 1.5 | T4 |
| T8 | Docs/legal for Phase 2: PRIVACY row, USER_GUIDE, extension README, ROADMAP status; Web Store policy check. | 2 | 0.5 | T6, T7 |
| T9 | 2b spike (IMAP read-only, pattern match, timestamp-only) - decision input only. | 2b | 1 | T0 |
| | **Phase 2 subtotal (2a, excluding 2b build)** | | **about 12-13 days** | |
| G0 | Per-vendor ToS review + written posture; counsel review of TERMS Auto-Maintain addendum and Web Store position. | 3 | 2 (+ counsel) | T0 |
| G1 | `require_pro` helper, 402 mapping, optional `features[]`; Polar re-validation with offline grace; retire HS256 from release builds. | 3 | 3 | T0 |
| G2 | Stage 3.0 assisted login ("open vendor / I logged in" -> manual activity row). | 3.0 | 1 | T4 |
| G3 | Data model: `automation_settings` (per-license consent), `automation_runs` audit table, migrations, retention job. | 3 | 1.5 | G1 |
| G4 | Spike: isolated per-vendor Tauri webview profile on Windows/macOS/Linux; no-IPC capability; logged-in marker check. Go/no-go for 3a. | 3a | 2 | G0 |
| G5 | Runner: scheduler task, jitter/backoff/concurrency, Pro + consent + flag checks, downgrade-to-reminder path. | 3a | 5 | G3, G4 |
| G6 | UI: replace teaser with Auto-Maintain panel (consent, per-license toggle, audit log view, wipe profile, kill switch). | 3a | 4 | G3 |
| G7 | Tests: mock-vendor integration suite, failure injection, secret/export leak assertions, frontend tests. | 3a | 4 | G5, G6 |
| G8 | Legal/docs: TERMS addendum, PRIVACY rows, USER_GUIDE, STATUS, SMOKE_TEST. | 3 | 1.5 | G0, G6 |
| | **Phase 3 subtotal (3.0 + 3a)** | | **about 24-26 days** | |
| G9 | 3b: keyring namespace per license, adapter trait, one pilot adapter for a vendor approved in G0, 2FA/CAPTCHA detection + abort. | 3b | 8-10 | G0 approval, G5 |
| G10 | Pilot validation across a real inactivity window (calendar time, not effort) and exit-criteria sign-off. | 3 | 1 effort, weeks of calendar | G5 or G9 |
| | **3b adds** | | **about 9-11 days** | |

Suggested sequencing: T0, T1 (quick wins) -> T2 -> Phase 2a (T3-T8) -> G0 and G1 in parallel with 2a -> G2 -> G4 spike -> decide 3a/3b -> G3, G5-G8 -> G9 only if D4 clears. Phase 4 items (retry/backoff, opt-in telemetry, multi-device activity merge) should land alongside G5 rather than after it, since the roadmap says Phase 4 gates Phase 3 maturity.

## 11. Open decisions (owner input needed)

- D1 Phase 2 tier: free vs Pro. (proposal: 2a free, 2b Pro)
- D2 Build the inbox signal at all, given the mailbox-privacy cost?
- D3 Approve the staged Phase 3 (3.0, 3a, then 3b only with vendor permission) in place of the roadmap's credential-first plan?
- D4 Which vendor is the pilot, and what ToS posture is acceptable?
- D5 Sell Auto-Maintain inside Pro or as a separate Polar add-on?

## 12. Out of scope for this document

No code, schema, UI, legal text, dataset, or `docs/internal/PROJECT-STATUS-AUDIT.md` edits were made. Nothing was built, run, or tested to produce this document; all "Built" labels reflect code and test names found by reading the tree on branch `feature/polar-webhook`.
