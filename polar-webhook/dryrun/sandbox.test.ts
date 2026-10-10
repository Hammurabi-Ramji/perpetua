// Same loop as purchase-to-activate.test.ts, but against the REAL Polar
// *sandbox* (https://sandbox-api.polar.sh) instead of the local mock.
//
// Needs a human to supply sandbox-only values and do one sandbox purchase. It
// skips (does not fail) when they are absent. It refuses to run if anything
// points at production Polar. See dryrun/README.md, "Sandbox runbook".
//
// Required env (all sandbox; read from the environment, never from files in the repo):
//   PERPETUA_BIN                    perpetua built with POLAR_API_BASE=https://sandbox-api.polar.sh
//                                   and the sandbox POLAR_ORGANIZATION_ID
//   POLAR_SANDBOX_ORG_ID            that same sandbox organization id (sanity check vs `perpetua config`)
//   POLAR_SANDBOX_WORKER_URL        deployed worker (or `wrangler dev`) whose POLAR_API_BASE is the sandbox
//   POLAR_SANDBOX_LICENSE_KEY       key emailed by a real sandbox purchase (100%-off code)
// Optional:
//   POLAR_SANDBOX_WEBHOOK_SECRET    the sandbox webhook endpoint's secret -> also tests a signed event
//   POLAR_SANDBOX_REVOKED_KEY       key from a sandbox order you then refunded -> tests revocation
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { signedDelivery, generateTestSecret } from "./sign.ts";
import { resolveBinary, bakedOrganizationId, startPerpetua, type PerpetuaInstance } from "./perpetua.ts";

const env = process.env;
const PROD = /(^|\/\/)api\.polar\.sh/;
const missing = ["PERPETUA_BIN", "POLAR_SANDBOX_ORG_ID", "POLAR_SANDBOX_WORKER_URL", "POLAR_SANDBOX_LICENSE_KEY"].filter((k) => !env[k]);
const skip = missing.length ? `skipped: set ${missing.join(", ")} (see dryrun/README.md)` : false;

describe("Polar SANDBOX purchase -> activate", { skip }, () => {
  const worker = (env.POLAR_SANDBOX_WORKER_URL ?? "").replace(/\/+$/, "");
  let vault: PerpetuaInstance;

  before(async () => {
    for (const k of ["POLAR_API_BASE", "POLAR_SANDBOX_WORKER_URL"]) {
      assert.ok(!PROD.test(env[k] ?? ""), `${k} points at production Polar; refusing to run`);
    }
    const bin = resolveBinary();
    assert.equal(bakedOrganizationId(bin), env.POLAR_SANDBOX_ORG_ID, "binary was built with a different organization id");
    vault = await startPerpetua(bin, 18491);
  });
  after(async () => {
    await vault?.stop();
  });

  it("worker rejects an event signed with the wrong secret (403)", async () => {
    const d = await signedDelivery({ type: "order.paid", data: { id: "order_sandbox_probe" } }, generateTestSecret());
    const res = await fetch(`${worker}/webhooks/polar`, { method: "POST", headers: d.headers, body: d.body });
    assert.equal(res.status, 403);
  });

  it("worker accepts an event signed with the sandbox endpoint secret (202)", { skip: !env.POLAR_SANDBOX_WEBHOOK_SECRET && "POLAR_SANDBOX_WEBHOOK_SECRET not set" }, async () => {
    const d = await signedDelivery({ type: "order.paid", data: { id: "order_sandbox_probe" } }, env.POLAR_SANDBOX_WEBHOOK_SECRET!);
    const res = await fetch(`${worker}/webhooks/polar`, { method: "POST", headers: d.headers, body: d.body });
    assert.equal(res.status, 202);
  });

  it("/discount-count reads real redemption numbers from the sandbox", async () => {
    const res = await fetch(`${worker}/discount-count`);
    assert.equal(res.status, 200, "502 here means the worker's POLAR_API_TOKEN / EARLY_BIRD_DISCOUNT_ID / POLAR_API_BASE are wrong");
    const { claimed, total } = (await res.json()) as { claimed: number; total: number | null };
    assert.equal(typeof claimed, "number");
    if (total !== null) assert.ok(claimed <= total);
    console.log(`  sandbox early-bird: ${claimed}/${total ?? "unlimited"} claimed (remaining ${total === null ? "n/a" : total - claimed})`);
  });

  it("free tier hits the paywall, the sandbox key unlocks Pro", async () => {
    for (let i = 0; i < 3; i++) assert.equal(await vault.addLicense(String(i)), 201);
    assert.equal(await vault.addLicense("3"), 402);
    const a = await vault.activate(env.POLAR_SANDBOX_LICENSE_KEY!);
    assert.equal(a.status, 200, a.json?.message);
    assert.equal(a.json.data.pro, true);
    assert.equal(await vault.addLicense("3"), 201);
  });

  it("a garbage key is rejected as not found", async () => {
    const fresh = await startPerpetua(resolveBinary(), 18492);
    try {
      const a = await fresh.activate(`PERPETUA-${crypto.randomUUID().toUpperCase()}`);
      assert.equal(a.status, 400);
      assert.match(a.json.message, /not found/i);
    } finally {
      await fresh.stop();
    }
  });

  it("a refunded/revoked key cannot be activated", { skip: !env.POLAR_SANDBOX_REVOKED_KEY && "POLAR_SANDBOX_REVOKED_KEY not set" }, async () => {
    const fresh = await startPerpetua(resolveBinary(), 18493);
    try {
      const a = await fresh.activate(env.POLAR_SANDBOX_REVOKED_KEY!);
      assert.equal(a.status, 400);
      assert.equal((await fresh.entitlement()).pro, false);
    } finally {
      await fresh.stop();
    }
  });
});
