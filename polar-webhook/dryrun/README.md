# Purchase -> webhook -> license -> activate dry-run

Exercises the whole money path with no real money and no live credentials.

## What is (and is not) in the loop

Polar, not our code, mints the license key. Our code does two independent things:

| Piece | Code | Role |
| --- | --- | --- |
| Webhook worker | `polar-webhook/src/index.ts` | Verifies Standard Webhooks signatures; only **logs** `order.paid`, `order.refunded`, `benefit_grant.revoked` (durable write is a TODO). Also serves `GET /discount-count`. It does **not** mint keys or grant access. |
| Activation | `desktop/src-tauri/src/polar.rs`, `POST /api/activate` | At unlock, calls Polar's public `POST /v1/customer-portal/license-keys/activate`. Polar's answer is the sole authority; `pro=1` is then stored locally and never re-checked. |

So "purchase -> activate" is really two parallel paths that meet in Polar:
`purchase -> Polar mints key -> (email) -> user pastes key -> app activates against Polar`
and `purchase -> Polar -> signed webhook -> worker (record keeping)`.

## Local, offline dry-run (default)

`mock-polar.ts` stands in for Polar (activate + discount endpoints, key minting,
refund, signed webhook delivery). The real worker code and the real `perpetua serve`
backend run against it. Secrets (webhook secret, API token, account password) are
generated per run, never printed, never written to disk.

```powershell
# 1. Build a perpetua binary whose Polar base URL is the mock (one-time, ~2 min)
..\desktop\scripts\build-polar-dryrun-binary.ps1        # prints PERPETUA_BIN=...
# 2. Run
cd polar-webhook; npm ci
$env:PERPETUA_BIN = "<path printed above>"
npm run dryrun
# Optional: run the worker under real workerd instead of the in-process adapter
$env:DRYRUN_WORKER = "wrangler"; npm run dryrun
```

Env knobs: `DRYRUN_MOCK_PORT` (default 8799, must match the build's `-MockPort`),
`DRYRUN_ORG_ID` (default `org_dryrun_local`), `DRYRUN_WRANGLER_PORT` (8788).
Ports 18481-18484 are used for throwaway `perpetua serve` instances.

The binary build uses a separate target dir (`src-tauri/target/polar-dryrun`, or a temp
mirror if a parent `[workspace]` Cargo.toml blocks an in-place build), so it never
replaces the offline binary the Playwright e2e uses.

### Scenarios covered (26 tests)

1. Free tier: 3 adds, 4th `402`, `/api/entitlement` -> `remaining: 0`.
2. Valid purchase: mock mints key, delivers signed `order.paid` + `benefit_grant.created` (worker `202`), discount counter +1, `/api/activate` -> `200 pro:true`, blocked add now `201`.
3. Signatures: wrong secret, tampered body, missing headers, stale timestamp, id/signature mismatch -> `403`; `whsec_` base64 secrets and rotated multi-signature headers accepted; unknown event type -> `202`; non-JSON signed body -> `400`; non-POST -> `405`.
4. Replay: identical signed event delivered twice -> `202` twice, counter unmoved.
5. Activation: unknown key, device-activation limit, blank key -> `400`, no Pro.
6. Refund: `order.refunded` / `benefit_grant.revoked` acked; revoked key refused on a fresh install (both the 200+`revoked` and 404 shapes); characterization of the known gap below.
7. Discount exhaustion: counter reaches total (`remaining == 0`), Polar-side refusal beyond it, full-price purchase still works, CORS/cache headers, `502` when the worker's token is rejected.

### Findings the dry-run documents (not bugs fixed here)

- **Refund does not revoke an already-activated install.** Activation is checked once; the worker only logs refunds. Scenario 6 pins this current behavior so a future revocation feature has to flip it deliberately.
- **No webhook dedupe.** The worker is stateless, so replays are harmless today. When the durable write lands, dedupe on the `webhook-id` header.
- **Mock fidelity assumption.** Whether real Polar answers 404 or 200+`status:"revoked"` for a revoked key on `activate` is unverified; the app handles both, and the sandbox runbook below is where to confirm which.

## Sandbox runbook (needs a human with sandbox access)

Sandbox-only; never use production tokens here. `sandbox.test.ts` refuses to run if
`POLAR_API_BASE` or the worker URL points at `api.polar.sh`, and skips if inputs are missing.

1. At <https://sandbox.polar.sh> create an organization, a product with a **License Key** benefit, an "Early Bird" discount with a redemption cap, and a **100%-off** discount code for testing. Note the sandbox organization id and the early-bird discount id.
2. Create a read-only sandbox access token (discounts read) and a webhook endpoint pointing at the worker URL, subscribed to `order.paid`, `order.refunded`, `benefit_grant.revoked`; note the endpoint secret.
3. Run the worker against the sandbox (local `wrangler dev`, or deploy):
   - set vars: `EARLY_BIRD_DISCOUNT_ID=<sandbox id>`, `POLAR_API_BASE=https://sandbox-api.polar.sh`
   - set secrets: `wrangler secret put POLAR_WEBHOOK_SECRET`, `wrangler secret put POLAR_API_TOKEN` (sandbox values). For `wrangler dev`, put them in the git-ignored `polar-webhook/.dev.vars`.
4. Build the app against the sandbox: `..\desktop\scripts\build-polar-dryrun-binary.ps1 -Mode sandbox -OrganizationId <sandbox org id>`.
5. Buy once through the sandbox checkout using the 100%-off code; copy the emailed license key. Check the worker logs (`wrangler tail`) show `polar webhook: order.paid`.
6. Optional: refund that order in the sandbox dashboard and copy another purchase's key for the revoked check (`POLAR_SANDBOX_REVOKED_KEY` should be the key from the refunded order).
7. Fill the values (see `.env.example`) in your shell and run `npm run dryrun:sandbox`.

Each activation consumes a device slot on the key (per the benefit's activation limit); use a fresh key per run or raise the limit in the sandbox.

Before the public launch: repeat with the production org id only for a final smoke test, and re-run the offline dry-run after any change to `polar.rs` or the worker.
