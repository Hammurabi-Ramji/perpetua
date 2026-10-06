// Offline dry-run of: purchase -> signed Polar webhook -> license key -> activate.
//
//   mock Polar (this repo)  --signed events-->  polar-webhook worker (real code)
//        |  mints key                                    |  GET /discount-count
//        v                                               v
//   perpetua serve (real Perpetua backend, built with POLAR_API_BASE -> mock) --activate--> mock Polar
//
// No real money, no live credentials, no network beyond 127.0.0.1. All secrets
// are generated per run and never printed or written to the repo.
//
// Run:  PERPETUA_BIN=<path> npm run dryrun        (see dryrun/README.md)
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { signedDelivery, generateTestSecret, signature } from "./sign.ts";
import { startMockPolar, type MockPolar } from "./mock-polar.ts";
import { startInProcessWorker, startWranglerWorker, type WorkerHost } from "./worker-host.ts";
import { resolveBinary, bakedOrganizationId, startPerpetua, type PerpetuaInstance } from "./perpetua.ts";

const MOCK_PORT = Number(process.env.DRYRUN_MOCK_PORT ?? 8799); // must match POLAR_API_BASE baked into the binary
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
const ORG_ID = process.env.DRYRUN_ORG_ID ?? "org_dryrun_local";
const DISCOUNT_ID = "disc_early_bird";
const MAX_REDEMPTIONS = 3; // small on purpose so exhaustion is cheap to reach
const WEBHOOK_SECRET = generateTestSecret();
const API_TOKEN = `tok_${crypto.randomUUID()}`;

let mock: MockPolar;
let worker: WorkerHost;
let vaultA: PerpetuaInstance; // the "buyer"
let vaultB: PerpetuaInstance; // a second, fresh install
const bin = resolveBinary();

const post = (path: string, d: { headers: Record<string, string>; body: string }) =>
  fetch(`${worker.url}${path}`, { method: "POST", headers: d.headers, body: d.body });
const discountCount = async () => (await fetch(`${worker.url}/discount-count`)).json() as Promise<{ claimed: number; total: number | null }>;
const mockCtl = (path: string, body: unknown) =>
  fetch(`${MOCK_BASE}${path}`, { method: "POST", body: JSON.stringify(body) });

before(async () => {
  assert.equal(
    bakedOrganizationId(bin),
    ORG_ID,
    "binary was not built with the dry-run POLAR_ORGANIZATION_ID (rebuild via build-polar-dryrun-binary.ps1)",
  );
  const env = {
    POLAR_WEBHOOK_SECRET: WEBHOOK_SECRET,
    POLAR_API_TOKEN: API_TOKEN,
    EARLY_BIRD_DISCOUNT_ID: DISCOUNT_ID,
    POLAR_API_BASE: MOCK_BASE,
  };
  worker =
    process.env.DRYRUN_WORKER === "wrangler"
      ? await startWranglerWorker(env, Number(process.env.DRYRUN_WRANGLER_PORT ?? 8788))
      : await startInProcessWorker(env);
  mock = await startMockPolar({
    port: MOCK_PORT,
    organizationId: ORG_ID,
    discountId: DISCOUNT_ID,
    apiToken: API_TOKEN,
    maxRedemptions: MAX_REDEMPTIONS,
    webhookUrl: `${worker.url}/webhooks/polar`,
    webhookSecret: WEBHOOK_SECRET,
  });
  vaultA = await startPerpetua(bin, 18481);
  vaultB = await startPerpetua(bin, 18482);
});

after(async () => {
  await Promise.allSettled([vaultA?.stop(), vaultB?.stop(), mock?.close(), worker?.close()]);
});

describe("1. free tier -> paywall (remaining: 0)", () => {
  it("allows 3 adds, blocks the 4th with 402, entitlement shows remaining 0", async () => {
    for (let i = 0; i < 3; i++) assert.equal(await vaultA.addLicense(String(i)), 201);
    assert.equal(await vaultA.addLicense("3"), 402);
    const e = await vaultA.entitlement();
    assert.deepEqual([e.pro, e.used, e.remaining], [false, 3, 0]);
  });
});

describe("2. valid purchase -> order.paid -> mint -> activate", () => {
  let key: string;
  it("discount counter starts at 0", async () => {
    assert.deepEqual(await discountCount(), { claimed: 0, total: MAX_REDEMPTIONS });
  });

  it("purchase (100%-off code) delivers signed order.paid + benefit_grant.created, worker acks 202", async () => {
    const r = await mock.purchase({ email: "buyer@example.test", discount: true });
    assert.ok(r.ok);
    key = r.key;
    assert.deepEqual(r.deliveries.map((d) => [d.eventType, d.workerStatus]), [
      ["order.paid", 202],
      ["benefit_grant.created", 202],
    ]);
    if (worker.logs.length) {
      assert.ok(worker.logs.some((l) => l.startsWith("polar webhook: order.paid")), "worker should log the handled event");
      assert.ok(worker.logs.some((l) => l.includes("ignoring benefit_grant.created")), "created grants are not in HANDLED_EVENTS");
    }
  });

  it("discount counter reflects the redemption", async () => {
    assert.deepEqual(await discountCount(), { claimed: 1, total: MAX_REDEMPTIONS });
  });

  it("activating the minted key unlocks Pro and lifts the cap", async () => {
    const a = await vaultA.activate(key);
    assert.equal(a.status, 200, JSON.stringify(a.json));
    assert.equal(a.json.data.pro, true);
    assert.equal(a.json.data.remaining, null);
    assert.ok(a.json.data.activated_at);
    assert.equal(await vaultA.addLicense("3"), 201, "previously blocked add now succeeds");
    assert.equal((await vaultA.entitlement()).pro, true);
  });
});

describe("3. webhook signature verification", () => {
  const event = { type: "order.paid", data: { id: "order_sig_test" } };

  it("also verifies a canonical whsec_<base64> secret (Standard Webhooks form)", async () => {
    const whsec = `whsec_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64")}`;
    const w = await startInProcessWorker({
      POLAR_WEBHOOK_SECRET: whsec,
      POLAR_API_TOKEN: API_TOKEN,
      EARLY_BIRD_DISCOUNT_ID: DISCOUNT_ID,
      POLAR_API_BASE: MOCK_BASE,
    });
    try {
      const d = await signedDelivery(event, whsec, { encoding: "base64" });
      const res = await fetch(`${w.url}/webhooks/polar`, { method: "POST", headers: d.headers, body: d.body });
      assert.equal(res.status, 202);
    } finally {
      await w.close();
    }
  });

  it("rejects a wrong secret (403)", async () => {
    const d = await signedDelivery(event, generateTestSecret());
    assert.equal((await post("/webhooks/polar", d)).status, 403);
  });

  it("rejects a tampered body (403)", async () => {
    const d = await signedDelivery(event, WEBHOOK_SECRET);
    const tampered = d.body.replace("order_sig_test", "order_evil");
    assert.equal((await post("/webhooks/polar", { ...d, body: tampered })).status, 403);
  });

  it("rejects missing headers (403) and a stale timestamp (403)", async () => {
    const d = await signedDelivery(event, WEBHOOK_SECRET);
    assert.equal((await post("/webhooks/polar", { body: d.body, headers: {} })).status, 403);
    const stale = await signedDelivery(event, WEBHOOK_SECRET, { timestampSeconds: Math.floor(Date.now() / 1000) - 3600 });
    assert.equal((await post("/webhooks/polar", stale)).status, 403);
  });

  it("rejects a signature over a different webhook-id (403)", async () => {
    const d = await signedDelivery(event, WEBHOOK_SECRET, { id: "msg_a" });
    const forged = { ...d, headers: { ...d.headers, "webhook-id": "msg_b" } };
    assert.equal((await post("/webhooks/polar", forged)).status, 403);
  });

  it("accepts a key-rotation header carrying a bad and a good signature", async () => {
    const d = await signedDelivery(event, WEBHOOK_SECRET);
    const good = d.headers["webhook-signature"];
    const bad = await signature("x", 1, "x", generateTestSecret());
    const rotated = { ...d, headers: { ...d.headers, "webhook-signature": `${bad} ${good}` } };
    assert.equal((await post("/webhooks/polar", rotated)).status, 202);
  });

  it("acks a correctly signed but unknown event type with 202 (no Polar retry storm)", async () => {
    const d = await signedDelivery({ type: "future.event_type", data: {} }, WEBHOOK_SECRET);
    assert.equal((await post("/webhooks/polar", d)).status, 202);
  });

  it("rejects a correctly signed non-JSON body (400)", async () => {
    const id = "msg_nonjson";
    const ts = Math.floor(Date.now() / 1000);
    const body = "not json";
    const res = await post("/webhooks/polar", {
      body,
      headers: { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": await signature(id, ts, body, WEBHOOK_SECRET) },
    });
    assert.equal(res.status, 400);
  });

  it("rejects non-POST on the webhook path (405)", async () => {
    assert.equal((await fetch(`${worker.url}/webhooks/polar`, { method: "PUT" })).status, 405);
  });
});

describe("4. replay / duplicate delivery", () => {
  it("re-delivering the identical signed event (same webhook-id) is acked 202 both times, idempotent", async () => {
    // Polar retries until it sees 2xx; the worker must tolerate that. Today the
    // worker is stateless (log only), so a replay is harmless. If the TODO'd
    // durable write is added, dedupe on the `webhook-id` header.
    const d = await signedDelivery({ type: "order.paid", data: { id: "order_replay" } }, WEBHOOK_SECRET, { id: "msg_replay_1" });
    assert.equal((await post("/webhooks/polar", d)).status, 202);
    assert.equal((await post("/webhooks/polar", d)).status, 202);
    assert.deepEqual(await discountCount(), { claimed: 1, total: MAX_REDEMPTIONS }, "a replay must not move the counter");
  });
});

describe("5. activation edge cases (key side)", () => {
  it("unknown key -> 400 'not found'", async () => {
    const a = await vaultB.activate("PERPETUA-DOES-NOT-EXIST");
    assert.equal(a.status, 400);
    assert.match(a.json.message, /not found/i);
    assert.equal((await vaultB.entitlement()).pro, false);
  });

  it("device-activation limit -> 400 'activation limit'", async () => {
    const r = await mock.purchase({ email: "limit@example.test", discount: false, activationLimit: 1 });
    assert.ok(r.ok);
    assert.equal((await vaultB.activate(r.key)).status, 200); // slot 1/1
    const second = await vaultB.activate(r.key); // slot 2/1
    assert.equal(second.status, 400);
    assert.match(second.json.message, /activation limit/i);
  });

  it("empty/whitespace key is rejected without granting Pro", async () => {
    const before = (await vaultA.entitlement()).pro;
    const a = await vaultA.activate("   ");
    assert.ok(a.status >= 400 && a.status < 500, `got ${a.status}`);
    assert.equal((await vaultA.entitlement()).pro, before);
  });
});

describe("6. refund / revocation", () => {
  let orderId: string;
  let key: string;
  it("order.refunded and benefit_grant.revoked are delivered and acked (worker handles both)", async () => {
    const r = await mock.purchase({ email: "refund@example.test", discount: false });
    assert.ok(r.ok);
    ({ orderId, key } = r);
    const refund = await mock.refund(orderId);
    assert.deepEqual(refund.deliveries.map((d) => [d.eventType, d.workerStatus]), [
      ["order.refunded", 202],
      ["benefit_grant.revoked", 202],
    ]);
    if (worker.logs.length) {
      assert.ok(worker.logs.some((l) => l.startsWith("polar webhook: order.refunded")));
      assert.ok(worker.logs.some((l) => l.startsWith("polar webhook: benefit_grant.revoked")));
    }
  });

  it("a revoked key cannot be activated on a fresh install (Polar answers 200+status=revoked)", async () => {
    await mockCtl("/_mock/config", { revoked_activate: "200-revoked" });
    const fresh = await startPerpetua(bin, 18483);
    try {
      const a = await fresh.activate(key);
      assert.equal(a.status, 400);
      assert.match(a.json.message, /revoked/i);
      assert.equal((await fresh.entitlement()).pro, false);
    } finally {
      await fresh.stop();
    }
  });

  it("a revoked key cannot be activated on a fresh install (Polar answers 404)", async () => {
    await mockCtl("/_mock/config", { revoked_activate: "404" });
    const fresh = await startPerpetua(bin, 18484);
    try {
      const a = await fresh.activate(key);
      assert.equal(a.status, 400);
      assert.match(a.json.message, /not found/i);
      assert.equal((await fresh.entitlement()).pro, false);
    } finally {
      await fresh.stop();
      await mockCtl("/_mock/config", { revoked_activate: "200-revoked" });
    }
  });

  it("KNOWN GAP (characterization): an install already activated before the refund stays Pro", async () => {
    // Activation is checked once (polar.rs); the worker only logs refunds.
    // This documents current behavior, it is not an endorsement. If revocation
    // is ever enforced, flip this assertion.
    const buyer = await mock.purchase({ email: "refund2@example.test" });
    assert.ok(buyer.ok);
    assert.equal((await vaultB.activate(buyer.key)).status, 200);
    await mock.refund(buyer.orderId);
    assert.equal((await vaultB.entitlement()).pro, true);
  });
});

describe("7. early-bird discount exhaustion", () => {
  it("counter climbs to total, then further discounted purchases are refused by Polar", async () => {
    // 1 redemption used in scenario 2; use the remaining 2.
    for (const expected of [2, 3]) {
      const r = await mock.purchase({ email: `eb${expected}@example.test`, discount: true });
      assert.ok(r.ok);
      assert.deepEqual(await discountCount(), { claimed: expected, total: MAX_REDEMPTIONS });
    }
    const { claimed, total } = await discountCount();
    assert.equal((total ?? 0) - claimed, 0, "remaining === 0");

    const over = await mock.purchase({ email: "late@example.test", discount: true });
    assert.equal(over.ok, false);
    assert.deepEqual(await discountCount(), { claimed: MAX_REDEMPTIONS, total: MAX_REDEMPTIONS }, "counter never exceeds total");
  });

  it("a full-price purchase still works after the early-bird is exhausted", async () => {
    const r = await mock.purchase({ email: "full@example.test", discount: false });
    assert.ok(r.ok);
    assert.equal((await vaultB.activate(r.key)).status, 200);
  });

  it("/discount-count is cacheable and CORS-restricted", async () => {
    const res = await fetch(`${worker.url}/discount-count`);
    assert.equal(res.headers.get("cache-control"), "public, max-age=60");
    assert.equal(res.headers.get("access-control-allow-origin"), "https://perpetua.hammurabi.click");
  });

  it("/discount-count returns 502 when Polar rejects the worker's token", async () => {
    const badWorker = await startInProcessWorker({
      POLAR_WEBHOOK_SECRET: WEBHOOK_SECRET,
      POLAR_API_TOKEN: "wrong-token",
      EARLY_BIRD_DISCOUNT_ID: DISCOUNT_ID,
      POLAR_API_BASE: MOCK_BASE,
    });
    try {
      assert.equal((await fetch(`${badWorker.url}/discount-count`)).status, 502);
    } finally {
      await badWorker.close();
    }
  });
});
