import { webhooks } from "@polar-sh/sdk/2026-04";

export interface Env {
  /** Set with: wrangler secret put POLAR_WEBHOOK_SECRET */
  POLAR_WEBHOOK_SECRET: string;
  /** Org access token, read-only scope is enough. Set with: wrangler secret put POLAR_API_TOKEN */
  POLAR_API_TOKEN: string;
  /** The "Early Bird — First 100" discount's id, from its URL in the Polar dashboard. */
  EARLY_BIRD_DISCOUNT_ID: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://perpetua.hammurabi.click",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * Events that actually matter for a one-time-purchase license-key product
 * (Perpetua doesn't sell subscriptions or seats). Everything else from
 * Polar's full event catalog is acknowledged but ignored.
 */
const HANDLED_EVENTS = new Set([
  "order.paid",
  "order.refunded",
  "benefit_grant.revoked",
]);

async function handleDiscountCount(env: Env): Promise<Response> {
  const response = await fetch(
    `https://api.polar.sh/v1/discounts/${env.EARLY_BIRD_DISCOUNT_ID}`,
    { headers: { Authorization: `Bearer ${env.POLAR_API_TOKEN}` } },
  );

  if (!response.ok) {
    return new Response("Could not reach Polar", {
      status: 502,
      headers: CORS_HEADERS,
    });
  }

  const discount = await response.json<{
    redemptions_count: number;
    max_redemptions: number | null;
  }>();

  return new Response(
    JSON.stringify({
      claimed: discount.redemptions_count,
      total: discount.max_redemptions,
    }),
    {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        // Short cache: this is a marketing-page counter, not a live ledger —
        // no need to hit Polar's API on every single page load.
        "Cache-Control": "public, max-age=60",
      },
    },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method === "GET" && url.pathname === "/discount-count") {
      return handleDiscountCount(env);
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const rawBody = await request.text();
    const headers = {
      "webhook-id": request.headers.get("webhook-id") ?? "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
    };

    let event;
    try {
      event = await webhooks.validateEvent(rawBody, headers, env.POLAR_WEBHOOK_SECRET);
    } catch (error) {
      if (error instanceof webhooks.PolarWebhookVerificationError) {
        return new Response("Invalid webhook signature", { status: 403 });
      }
      if (error instanceof webhooks.PolarWebhookUnknownTypeError) {
        // Correctly signed, just a newer event type than this SDK knows about.
        // Ack it so Polar doesn't retry — nothing here would have handled it anyway.
        console.warn("polar webhook: unrecognized event type", error.eventType);
        return new Response(null, { status: 202 });
      }
      if (error instanceof webhooks.PolarWebhookError) {
        return new Response("Invalid webhook payload", { status: 400 });
      }
      throw error;
    }

    if (HANDLED_EVENTS.has(event.type)) {
      // TODO: replace with a durable write (D1/KV) once there's an actual
      // consumer for this data. Perpetua's own activation flow checks Polar
      // once at unlock and never again (see LtLMA/src-tauri/src/polar.rs),
      // so today this is purely an ops/record-keeping signal, not something
      // that revokes access automatically.
      console.log(`polar webhook: ${event.type}`, JSON.stringify(event.data));
    } else {
      console.log(`polar webhook: ignoring ${event.type}`);
    }

    return new Response(null, { status: 202 });
  },
} satisfies ExportedHandler<Env>;
