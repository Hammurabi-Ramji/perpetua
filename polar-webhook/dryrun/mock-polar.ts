// Local stand-in for the slice of Polar that Perpetua touches. NOT a faithful
// Polar clone: it models only the contracts Perpetua depends on, so the whole
// purchase -> webhook -> license key -> activate loop can run with no network,
// no real money and no credentials.
//
//   Polar API surface (what the app / worker actually call)
//     POST /v1/customer-portal/license-keys/activate   (public; LtLMA polar.rs)
//     GET  /v1/discounts/:id                           (Bearer token; worker)
//   Polar behavior simulated
//     purchase  -> mints a license key, bumps discount redemptions,
//                  delivers signed `order.paid` (+ `benefit_grant.created`)
//     refund    -> revokes the key, delivers signed `order.refunded`
//                  (+ `benefit_grant.revoked`)
//   Test-control endpoints (not part of Polar)
//     POST /_mock/purchase  {email, discount?, activation_limit?}
//     POST /_mock/refund    {order_id}
//     POST /_mock/config    {revoked_activate?: "200-revoked" | "404"}
//     GET  /_mock/state
//
// Run standalone (e.g. to pair with `wrangler dev`):
//   MOCK_WEBHOOK_URL=http://127.0.0.1:8788/ MOCK_WEBHOOK_SECRET=... \
//     node dryrun/mock-polar.ts

import http from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { signedDelivery } from "./sign.ts";

export interface MockPolarOptions {
  port?: number;
  organizationId: string;
  discountId: string;
  /** Token the worker must present to read the discount. */
  apiToken: string;
  /** Total early-bird redemptions available. */
  maxRedemptions: number;
  /** Where signed webhook events are POSTed. */
  webhookUrl: string;
  webhookSecret: string;
}

interface KeyRecord {
  key: string;
  status: "granted" | "revoked" | "disabled";
  limitActivations: number;
  activations: { id: string; label: string }[];
  orderId: string;
  email: string;
}

export interface Delivery {
  eventType: string;
  webhookId: string;
  workerStatus: number;
}

export interface MockPolar {
  url: string;
  close(): Promise<void>;
  /** Direct (in-process) helpers, same behavior as the /_mock endpoints. */
  purchase(input: { email: string; discount?: boolean; activationLimit?: number }): Promise<
    | { ok: true; orderId: string; key: string; deliveries: Delivery[] }
    | { ok: false; status: number; detail: string }
  >;
  refund(orderId: string): Promise<{ deliveries: Delivery[] }>;
  deliveries: Delivery[];
  state(): { redemptions: number; max: number; keys: number };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function startMockPolar(opts: MockPolarOptions): Promise<MockPolar> {
  const keys = new Map<string, KeyRecord>();
  const orders = new Map<string, KeyRecord>();
  const deliveries: Delivery[] = [];
  let redemptions = 0;
  let revokedActivateMode: "200-revoked" | "404" = "200-revoked";

  async function deliver(type: string, data: unknown): Promise<Delivery> {
    const signed = await signedDelivery({ type, data }, opts.webhookSecret);
    const res = await fetch(opts.webhookUrl, {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });
    const d = { eventType: type, webhookId: signed.headers["webhook-id"], workerStatus: res.status };
    deliveries.push(d);
    return d;
  }

  const orderData = (rec: KeyRecord, status: string, discounted: boolean) => ({
    id: rec.orderId,
    status,
    paid: status === "paid",
    currency: "usd",
    total_amount: 0,
    discount_id: discounted ? opts.discountId : null,
    customer: { id: `cus_${rec.orderId}`, email: rec.email },
    product: { id: "prod_perpetua_pro", name: "Perpetua Pro" },
  });

  const grantData = (rec: KeyRecord, status: "granted" | "revoked") => ({
    id: `grant_${rec.orderId}`,
    status,
    is_granted: status === "granted",
    is_revoked: status === "revoked",
    customer_id: `cus_${rec.orderId}`,
    benefit: { type: "license_keys" },
    // Real Polar never puts the full key in a webhook, only a display suffix.
    properties: { display_key: `****${rec.key.slice(-6)}` },
  });

  const discountedOrders = new Set<string>();

  async function purchase(input: { email: string; discount?: boolean; activationLimit?: number }) {
    if (input.discount) {
      if (redemptions >= opts.maxRedemptions) {
        return { ok: false as const, status: 422, detail: "Discount code has reached its redemption limit" };
      }
      redemptions += 1;
    }
    const orderId = `order_${randomUUID()}`;
    const rec: KeyRecord = {
      key: `PERPETUA-${randomUUID().toUpperCase()}`,
      status: "granted",
      limitActivations: input.activationLimit ?? 3,
      activations: [],
      orderId,
      email: input.email,
    };
    keys.set(rec.key, rec);
    orders.set(orderId, rec);
    if (input.discount) discountedOrders.add(orderId);
    const out: Delivery[] = [];
    out.push(await deliver("order.paid", orderData(rec, "paid", !!input.discount)));
    out.push(await deliver("benefit_grant.created", grantData(rec, "granted")));
    return { ok: true as const, orderId, key: rec.key, deliveries: out };
  }

  async function refund(orderId: string) {
    const rec = orders.get(orderId);
    if (!rec) throw new Error(`unknown order ${orderId}`);
    rec.status = "revoked";
    const out: Delivery[] = [];
    out.push(await deliver("order.refunded", orderData(rec, "refunded", discountedOrders.has(orderId))));
    out.push(await deliver("benefit_grant.revoked", grantData(rec, "revoked")));
    return { deliveries: out };
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://mock");
      const raw = req.method === "POST" ? await readBody(req) : "";
      const body = raw ? JSON.parse(raw) : {};

      // ---- Polar API surface ----
      if (req.method === "POST" && url.pathname === "/v1/customer-portal/license-keys/activate") {
        if (body.organization_id !== opts.organizationId) {
          return json(res, 404, { error: "ResourceNotFound", detail: "License key does not exist." });
        }
        const rec = keys.get(String(body.key ?? ""));
        if (!rec) return json(res, 404, { error: "ResourceNotFound", detail: "License key does not exist." });
        if (rec.status !== "granted" && revokedActivateMode === "404") {
          return json(res, 404, { error: "ResourceNotFound", detail: "License key does not exist." });
        }
        if (rec.status === "granted" && rec.activations.length >= rec.limitActivations) {
          return json(res, 403, { error: "NotPermitted", detail: "License key activation limit already reached." });
        }
        const activation = { id: `act_${randomUUID()}`, label: String(body.label ?? "") };
        if (rec.status === "granted") rec.activations.push(activation);
        return json(res, 200, {
          ...activation,
          license_key_id: `lk_${rec.orderId}`,
          license_key: {
            id: `lk_${rec.orderId}`,
            organization_id: opts.organizationId,
            display_key: `****${rec.key.slice(-6)}`,
            status: rec.status,
            limit_activations: rec.limitActivations,
          },
        });
      }

      if (req.method === "GET" && url.pathname === `/v1/discounts/${opts.discountId}`) {
        if (req.headers.authorization !== `Bearer ${opts.apiToken}`) {
          return json(res, 401, { error: "Unauthorized", detail: "Invalid token" });
        }
        return json(res, 200, {
          id: opts.discountId,
          name: "Early Bird - First 100",
          redemptions_count: redemptions,
          max_redemptions: opts.maxRedemptions,
        });
      }

      // ---- test controls ----
      if (req.method === "POST" && url.pathname === "/_mock/purchase") {
        const r = await purchase({
          email: body.email ?? "buyer@example.test",
          discount: body.discount,
          activationLimit: body.activation_limit,
        });
        return json(res, r.ok ? 200 : r.status, r.ok ? r : { detail: r.detail });
      }
      if (req.method === "POST" && url.pathname === "/_mock/refund") {
        return json(res, 200, await refund(String(body.order_id)));
      }
      if (req.method === "POST" && url.pathname === "/_mock/config") {
        if (body.revoked_activate) revokedActivateMode = body.revoked_activate;
        return json(res, 200, { revoked_activate: revokedActivateMode });
      }
      if (req.method === "GET" && url.pathname === "/_mock/state") {
        return json(res, 200, { redemptions, max: opts.maxRedemptions, keys: keys.size, deliveries });
      }

      json(res, 404, { detail: `mock-polar: no route for ${req.method} ${url.pathname}` });
    } catch (error) {
      json(res, 500, { detail: String(error) });
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const api: MockPolar & { setRevokedActivateMode(m: "200-revoked" | "404"): void } = {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
    purchase,
    refund,
    deliveries,
    state: () => ({ redemptions, max: opts.maxRedemptions, keys: keys.size }),
    setRevokedActivateMode: (m) => {
      revokedActivateMode = m;
    },
  };
  return api;
}

// Standalone entrypoint.
if (import.meta.main) {
  const need = (name: string) => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is required`);
    return v;
  };
  const mock = await startMockPolar({
    port: Number(process.env.MOCK_PORT ?? 8799),
    organizationId: process.env.MOCK_ORG_ID ?? "org_dryrun_local",
    discountId: process.env.MOCK_DISCOUNT_ID ?? "disc_early_bird",
    apiToken: need("MOCK_API_TOKEN"),
    maxRedemptions: Number(process.env.MOCK_MAX_REDEMPTIONS ?? 100),
    webhookUrl: need("MOCK_WEBHOOK_URL"),
    webhookSecret: need("MOCK_WEBHOOK_SECRET"),
  });
  console.log(`mock-polar listening on ${mock.url}`);
}
