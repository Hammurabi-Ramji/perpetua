# Keep-Alive — phased development outline

Perpetua's core job: stop lifetime licenses from being revoked for inactivity.
This outlines how the keep-alive capability grows — from the shipped foundation
to fully automated maintenance. Each phase states its goal, deliverables, exit
criteria, and risks, and builds on the one before it.

Guiding principle: the user stays in the loop (we remind, they act) until the
explicitly opt-in, paid Auto-Maintain tier takes over.

---

## Phase 0 — Foundation (shipped)

- Status: done, tested, running in the desktop build.
- Goal: track a per-license login cadence and warn before the window closes.
- Deliverables:
  - `keepalive_days` + `last_active` on each license (schema migrated for
    existing vaults).
  - `keepalive` reminder kind in `get_reminder_items`
    (`due = last_active | purchase_date + keepalive_days`).
  - Background maintainer: `spawn_reminder_scheduler` (6-hour tokio loop) +
    `collect_due_notifications`, delivered as native OS notifications, kept alive
    by autostart and the system tray.
  - "Mark as used today" → `POST /api/licenses/:id/active` → resets the clock.
  - Once-per-day dedupe via the `reminder_notifications` table.
  - Proactive safety margin: prompts target a "maintain by" date
    `max(7 days, ¼ of the cadence)` ahead of the real revocation, so a login
    always lands well before the deadline rather than cutting it close.
- Exit criteria (met): unit + HTTP + headless coverage green; live toast fired
  and went silent after mark-active; proactive prompt verified firing ~3 weeks
  ahead of a 90-day revocation.

---

## Phase 1 — Vendor policy ingestion

- Status: **shipped (MVP dataset)** — 2026-07-19.
- Goal: stop making users guess the cadence. Auto-suggest `keepalive_days` from a
  curated dataset of known vendor inactivity windows.
- Deliverables:
  - Versioned bundled dataset: `src-tauri/data/vendor-policies.json`.
  - Matcher in `src-tauri/src/vendor_policy.rs` (`source_site` + product hints,
    confidence + source + last-verified).
  - API: `GET /api/vendor-policies/suggest`, `GET /api/vendor-policies`.
  - License form auto-fill with "unknown — set manually" fallback and Apply
    suggestion control (`LicenseForm.svelte`).
  - Drop-in refresh without rebuild: place `vendor-policies.json` in the app
    data dir (`…/perpetua/vendor-policies.json`); loaded at process start.
- Risks: data accuracy and staleness; needs ongoing curation. Mitigation: show
  the source and verified date; let the user override.
- Exit criteria: **met for MVP** — known vendors (e.g. AppSumo) pre-fill; unknown
  vendors degrade gracefully. Dataset curation remains ongoing.

---

## Phase 2 — Activity inference

- Status: planned.
- Goal: reduce manual "mark as used" by detecting real activity signals.
- Deliverables (pick the lowest-risk wins first):
  - A lightweight browser companion that pings Perpetua when the user visits a
    tracked vendor, auto-resetting that license's clock.
  - Optional inbox signal: detect vendor "we miss you / account inactive" emails
    to raise a license's urgency.
- Risks: privacy and scope creep. Mitigation: strictly opt-in, local-first, and
  never store more than a timestamp.
- Exit criteria: a tracked license's clock can reset without a manual click, with
  the manual button still available as the default.

---

## Phase 3 — Auto-Maintain (Pro)

- Status: gated future tier (the "Coming soon · Pro" teaser today).
- Goal: Perpetua performs the periodic login itself, fully hands-off.
- Deliverables:
  - Secure credential vault in the OS keychain (Windows Credential Manager) —
    never plaintext, never in the SQLite vault.
  - Per-vendor login adapters and a headless/automated session runner.
  - An audit log of every automated action, with per-license opt-in.
  - Pro entitlement gating, reusing the existing Polar activation seam.
- Risks (high — why this is deliberately last): credential liability, vendor
  terms-of-service, 2FA/CAPTCHA breakage, and per-vendor fragility. Mitigation:
  opt-in per license, transparent logging, and graceful fallback to Phase 0
  reminders whenever automation can't run.
- Exit criteria: for a supported vendor, a license stays alive across an
  inactivity window with no user action, and any failure cleanly downgrades to a
  reminder.

---

## Phase 4 — Reliability, telemetry, and sync

- Status: ongoing hardening, layered across the phases above.
- Goal: make keep-alive dependable at scale.
- Deliverables:
  - Retries with backoff and structured logging for the scheduler and adapters.
  - Opt-in failure telemetry to spot broken vendor adapters early.
  - Multi-device awareness so marking a license active on one machine is
    reflected on another (ties into the LtLM web edition).
- Exit criteria: failures are observable and recoverable; activity state is
  consistent across a user's devices.

---

## Dependencies and sequencing

- Phase 1 sharpens Phase 0 (smarter defaults) and is independent of 2–4.
- Phase 2 lowers the manual burden but is not required for Phase 3.
- Phase 3 should ship only after Phase 0 reminders are proven in the field and the
  credential-vault and audit pieces are in place.
- Phase 4 runs continuously and gates the maturity of Phase 3.
