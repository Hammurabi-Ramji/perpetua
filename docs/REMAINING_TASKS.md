# Perpetua — Remaining Tasks (post-fix pass, 2026-10-06)

Companion to the internal working papers in `docs/internal/` (git-ignored):
`PERPETUA_SOTA_AUDIT_AND_ACTUARIAL_ANALYSIS.md` and
`audit-artifacts/findings_register.csv` (which now carries a `status` and
`resolution_2026_10_06` column per finding). This file lists only what is
**left**: things that need the owner's hands, credentials, or a decision, plus
the engineering backlog in priority order.

Everything in the "Done in this pass" section at the bottom is already in the
working tree and verified (`cargo test` 42/42, frontend `vitest` 11/11,
`svelte-check` 0/0, extension 19/19, worker 15/15 + `tsc`, `npm run build`,
`cargo build --release` with `perpetua config` → `Polar activation: ENABLED`,
headless `perpetua serve` smoke: `/api/health` 200, `/api/vault/status`
`has_users=false`, foreign `Host` → 421, anonymous restore on empty vault →
502 (reaches WebDAV, not blocked by auth), and `npm run tauri build --bundles
nsis` → `Perpetua_1.0.0_x64-setup.exe`). The MSI bundler (`WiX light`) failed
with "Access is denied" inside the sandboxed build shell used for this pass;
re-run `build-release.ps1` in a normal PowerShell session to confirm the MSI
also builds — CI builds both targets.

## 1. Owner-only actions (block a public launch)

| # | Task | Why | Where |
|---|------|-----|-------|
| O1 | Add repository secret `POLAR_ORGANIZATION_ID` = `2cee7fb6-a84f-442d-b2a2-5eb396253a85` | `release.yml` now **fails** without it (BLD-10); until then every GitHub-built installer would be offline-key-only | GitHub → Settings → Secrets and variables → Actions |
| O2 | Add repository secret `PERPETUA_LICENSE_SECRET` (the production HS256 secret already used by `build-release.ps1`) | Release build refuses to compile without it | same |
| O3 | Add repository **variable** `VITE_PERPETUA_CHECKOUT_URL` = the Polar checkout link already used on the website | In-app Buy button falls back to the product page until this is set (BIZ-01) | GitHub → Variables; locally: `desktop/.env` (see `.env.example`) |
| O4 | Confirm `hcc@hammurabicodingcompany.com` is a monitored mailbox | It is the only address in SUPPORT.md, PRIVACY.md, TROUBLESHOOTING.md and the Auto-Maintain card (LEG-09) | Mail provider |
| O5 | Buy/renew a Windows code-signing certificate (OV or EV) and wire `PERPETUA_*` signing env vars (`scripts/Sign-Windows.ps1`, `docs/SIGNING-AND-STORE.md`); Apple Developer ID + notarization for macOS | SmartScreen / Gatekeeper warnings on every install (BLD-06). Cannot be done from the repo | Vendor purchase + CI secrets |
| O6 | Replace the v1.0.0 GitHub release assets with a build from current `main` (or publish v1.0.1) and re-point the website downloads at it | Two different binaries are labelled 1.0.0 (BLD-07) | Tag `v1.0.1` → release workflow (draft) → publish; update site links |
| O7 | Run one real Polar **sandbox** purchase → key email → in-app activation on a fresh install (`polar-webhook/dryrun/README.md`) | The live checkout path has never been exercised end-to-end (QA-06) | Polar sandbox org |
| O8 | Clean-VM install smoke (`desktop/docs/INSTALL_SMOKE.md`, `Run-InstallSmoke.ps1`): install, first launch, 3 licences → paywall → activate, close-to-tray, launch-at-login toggle, uninstall leaves no `Run` key | Never executed on a machine without a dev toolchain | Disposable Windows VM |
| O9 | Dismiss GitHub secret-scanning alert #1 as a test fixture (`whsec_` decodes to `testsecretkeyforlocaltesting`) | Noise that hides real alerts (WRK-04) | GitHub → Security |
| O10 | Decide refund terms in `legal/TERMS.md` | "Lifetime" is now defined there as a one-time Pro software license, not lifetime support. The in-repo landing page does not state a 30-day refund. If the live site still promises one, the Terms need to match it. Legal wording stays an owner decision | `desktop/legal/TERMS.md` |
| O11 | Deploy `polar-webhook` (`wrangler deploy`), set `POLAR_WEBHOOK_SECRET`, `POLAR_API_TOKEN`, `EARLY_BIRD_DISCOUNT_ID`, and register the webhook URL in Polar | Worker is tested but not deployed/wired (WRK-03) | Cloudflare + Polar dashboard |

## 2. Engineering backlog (priority order)

### P1 — before wide distribution

1. **At-rest vault encryption** (SEC-09, ARCH-02) — plan exists in
   `docs/AT-REST-ENCRYPTION-PLAN.md`; the keyring layer, `apply_schema`, and
   the restore verification added in this pass are the prerequisites it
   lists.
2. **Token revocation** (SEC-04) — `token_version` column bumped on password
   change; extension token should be a scoped, shorter-lived credential.
3. **Sharing: leave/remove member + cap at one** (SEC-08).
4. **Per-code attempt counter** for reset/invite codes (SEC-05 residual).
5. **Pin GitHub Actions to SHAs**, enable Dependabot, add `cargo audit` /
   `npm audit` jobs (BLD-01, BLD-05).
6. **Branch protection + CODEOWNERS + SECURITY.md** (BLD-03, LEG-06).
7. **Playwright E2E in CI** against the release binary with per-spec databases
   (QA-04).
8. **Third-party licence notices** for Tesseract / traineddata / Rust crates
   (LEG-04).

### P2 — quality and product

9. Snooze/dismiss for reminders; keep-alive baseline when `last_active` is
   missing (REL-04 residual, REL-05).
10. Vendor-policy matcher: whole-word + domain matching review, dataset
    provenance URLs (VP-01, VP-02).
11. Remove unused JS deps `@tauri-apps/plugin-fs/os/store/dialog` (lockfile
    change; DEP-04 residual). Migrate `tauri-plugin-shell::open` →
    `tauri-plugin-opener` (deprecation warning).
12. `PRAGMA user_version`-based migrations (ARCH-04 residual).
13. Cloud backup history (N remote copies) and scheduled sync (DATA-01
    residual).
14. Extension: verify selectors on live markup, keep-alive hint on import,
    402 surfaced in popup (EXT-04, EXT-05, EXT-08).
15. Accessibility pass on modals/banners (UX-02); OCR locale handling (UX-01).
16. macOS Intel build; auto-updater.

### P3 — strategic (from the actuarial analysis)

17. Measure the revoke-for-inactivity rate across tracked vendors before
    further investment in Auto-Maintain (BIZ-10).
18. Decide on the pricing/free-tier position with the obligations model in
    `docs/internal/audit-artifacts/actuarial_model.py` (BIZ-04, BIZ-05, BIZ-08).
19. Replace the HTTP-as-IPC architecture with Tauri `invoke` commands
    (ARCH-01) — the three commands added in this pass
    (`get_launch_at_login`, `set_launch_at_login`, `get_diagnostics_log_path`)
    are the first step.

## 3. Done in this pass (summary)

Backend (`desktop/src-tauri`):

- Restore gating + automatic pre-restore snapshot + integrity/schema check on
  the candidate DB + rollback (SEC-01, DATA-04, REL-11).
- Host-header loopback check → 421 (SEC-03).
- SMTP TLS mode by port, timeouts, `POST /api/account/recovery/test`;
  password never echoed, blank = keep (REL-01, SEC-07, REL-15 part).
- 8-character codes, prior codes invalidated, tolerant input (SEC-05).
- Case-insensitive emails, constant-time login, 72-byte cap (SEC-11).
- WebDAV https-only, timeouts, 256 MiB cap, atomic upload + read-back verify;
  stable recovery key with explicit rotation (SEC-12, REL-14, DATA-01, DATA-02).
- Notification preference honoured + one-time migration; mark-delivered only
  after the OS accepted the notification; inactive statuses excluded;
  `keepalive_days` ≤ 3650 with checked arithmetic; local-date semantics;
  RFC3339 dates accepted (REL-02/03/04/06/07, EXT-02).
- Desktop shell: launch-at-login opt-in commands, `--minimized` honoured,
  single-instance, startup errors → `perpetua.log` + dialog, unused
  fs/os plugins and capabilities removed, CSP tightened (REL-08/09/13,
  OPS-02, SEC-10).
- 11 new/updated tests (42 total).

Frontend (`desktop/src`): `commerce.ts` (env-driven checkout URL / price /
support email), honest paywall copy, two-step delete, vault-status-aware
sign-in restore, Vault Tools restore with acknowledgement + snapshot name,
key-rotation checkbox, launch-at-login toggle, send-test-email, email toggle
removed, "Notify me" removed, keyed `{#each}` blocks.

Extension: `notifications` permission, unused permissions dropped, date
normalisation, DOM-safe popup, loopback-only API base; 7 new tests.

Worker: PII-free logging, guarded `/discount-count`; 4 new tests.

CI/release: release config check + post-build `perpetua config` assertion,
least-privilege permissions, Node 22, `--locked`, Windows Rust job, worker job,
SHA256SUMS on release, `.gitattributes`, `.env.example`, `build-release.ps1`
env override + verification.

Docs/legal: PRIVACY.md and SUPPORT.md rewritten, USER_GUIDE / TROUBLESHOOTING
/ STATUS updated, findings register annotated.
