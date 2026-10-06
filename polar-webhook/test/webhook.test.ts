import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";

const SECRET = "whsec_dGVzdHNlY3JldGtleWZvcmxvY2FsdGVzdGluZw==";

async function sign(id: string, timestamp: number, body: string, secret: string) {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedContent = `${id}.${timestamp}.${body}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `v1,${b64}`;
}

function request(body: string, headers: Record<string, string>) {
  return new Request("https://example.com/webhooks/polar", {
    method: "POST",
    headers,
    body,
  });
}

const env = {
  POLAR_WEBHOOK_SECRET: SECRET,
  POLAR_API_TOKEN: "test-token",
  EARLY_BIRD_DISCOUNT_ID: "discount_123",
};

test("discount-count returns the real claimed/total from Polar", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedAuth = "";
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
    return new Response(
      JSON.stringify({ redemptions_count: 7, max_redemptions: 100 }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const res = await worker.fetch(
      new Request("https://example.com/discount-count"),
      env,
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { claimed: 7, total: 100 });
    assert.equal(capturedUrl, "https://api.polar.sh/v1/discounts/discount_123");
    assert.equal(capturedAuth, "Bearer test-token");
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://perpetua.hammurabi.click");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("discount-count returns 502 if Polar's API errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;

  try {
    const res = await worker.fetch(
      new Request("https://example.com/discount-count"),
      env,
    );
    assert.equal(res.status, 502);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OPTIONS preflight returns CORS headers", async () => {
  const res = await worker.fetch(
    new Request("https://example.com/discount-count", { method: "OPTIONS" }),
    env,
  );
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://perpetua.hammurabi.click");
});

test("accepts a validly signed order.paid event", async () => {
  const body = JSON.stringify({ type: "order.paid", data: { id: "order_123" } });
  const id = "msg_1";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(id, timestamp, body, SECRET);

  const res = await worker.fetch(
    request(body, {
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": signature,
    }),
    env,
  );

  assert.equal(res.status, 202);
});

test("acknowledges but ignores an unhandled-but-known event type", async () => {
  const body = JSON.stringify({ type: "customer.created", data: { id: "cust_1" } });
  const id = "msg_2";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(id, timestamp, body, SECRET);

  const res = await worker.fetch(
    request(body, {
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": signature,
    }),
    env,
  );

  assert.equal(res.status, 202);
});

test("rejects a tampered body", async () => {
  const original = JSON.stringify({ type: "order.paid", data: { id: "order_123" } });
  const id = "msg_3";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(id, timestamp, original, SECRET);

  const tampered = JSON.stringify({ type: "order.paid", data: { id: "order_999" } });

  const res = await worker.fetch(
    request(tampered, {
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": signature,
    }),
    env,
  );

  assert.equal(res.status, 403);
});

test("rejects a signature made with the wrong secret", async () => {
  const body = JSON.stringify({ type: "order.paid", data: { id: "order_123" } });
  const id = "msg_4";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(id, timestamp, body, "whsec_d3JvbmdzZWNyZXQ=");

  const res = await worker.fetch(
    request(body, {
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": signature,
    }),
    env,
  );

  assert.equal(res.status, 403);
});

test("rejects a stale timestamp", async () => {
  const body = JSON.stringify({ type: "order.paid", data: { id: "order_123" } });
  const id = "msg_5";
  const timestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
  const signature = await sign(id, timestamp, body, SECRET);

  const res = await worker.fetch(
    request(body, {
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": signature,
    }),
    env,
  );

  assert.equal(res.status, 403);
});

test("rejects missing signature headers", async () => {
  const body = JSON.stringify({ type: "order.paid", data: { id: "order_123" } });
  const res = await worker.fetch(request(body, {}), env);
  assert.equal(res.status, 403);
});

test("rejects non-POST requests", async () => {
  const res = await worker.fetch(
    new Request("https://example.com/webhooks/polar", { method: "GET" }),
    env,
  );
  assert.equal(res.status, 405);
});

test("discount-count honors POLAR_API_BASE (sandbox / local mock) and trims trailing slashes", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  globalThis.fetch = (async (url: string) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify({ redemptions_count: 100, max_redemptions: 100 }), { status: 200 });
  }) as typeof fetch;

  try {
    const res = await worker.fetch(
      new Request("https://example.com/discount-count"),
      { ...env, POLAR_API_BASE: "https://sandbox-api.polar.sh/" },
    );
    assert.equal(capturedUrl, "https://sandbox-api.polar.sh/v1/discounts/discount_123");
    assert.deepEqual(await res.json(), { claimed: 100, total: 100 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
