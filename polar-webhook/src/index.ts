import { webhooks } from "@polar-sh/sdk/2026-04";

export interface Env {
  /** Set with: wrangler secret put POLAR_WEBHOOK_SECRET */
  POLAR_WEBHOOK_SECRET: string;
  /** Org access token, read-only scope is enough. Set with: wrangler secret put POLAR_API_TOKEN */
  POLAR_API_TOKEN: string;
  /** The "Early Bird — First 100" discount's id, from its URL in the Polar dashboard. */
  EARLY_BIRD_DISCOUNT_ID: string;
  /**
   * Optional Polar API origin. Defaults to production (https://api.polar.sh).
   * Set to https://sandbox-api.polar.sh for the sandbox dry-run, or to a local
   * mock server for the offline dry-run (see dryrun/README.md).
   */
  POLAR_API_BASE?: string;
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

/**
 * The non-personal subset of an event payload worth having in logs: enough
 * to find the record in Polar's dashboard, nothing that identifies the buyer.
 */
export function eventSummary(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const record = data as Record<string, unknown>;
  const pick = (key: string) => (typeof record[key] === "string" || typeof record[key] === "number" ? record[key] : undefined);
  const nestedId = (key: string) => {
    const value = record[key];
    return value && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string"
      ? (value as Record<string, unknown>).id
      : undefined;
  };
  const summary: Record<string, unknown> = {
    id: pick("id"),
    status: pick("status"),
    amount: pick("amount") ?? pick("total_amount"),
    currency: pick("currency"),
    created_at: pick("created_at"),
    customer_id: pick("customer_id") ?? nestedId("customer"),
    product_id: pick("product_id") ?? nestedId("product"),
    order_id: pick("order_id") ?? nestedId("order"),
    benefit_id: pick("benefit_id") ?? nestedId("benefit"),
  };
  for (const key of Object.keys(summary)) {
    if (summary[key] === undefined) delete summary[key];
  }
  return summary;
}

/** Upstream budget for the marketing counter; the page degrades fine on 502. */
const POLAR_FETCH_TIMEOUT_MS = 5_000;

function upstreamUnavailable(): Response {
  return new Response("Could not reach Polar", {
    status: 502,
    headers: CORS_HEADERS,
  });
}

async function handleDiscountCount(env: Env): Promise<Response> {
  if (!env.EARLY_BIRD_DISCOUNT_ID || !env.POLAR_API_TOKEN) {
    // Misconfigured deployment: don't hit Polar with an empty id/token.
    console.error("discount-count: EARLY_BIRD_DISCOUNT_ID or POLAR_API_TOKEN not set");
    return upstreamUnavailable();
  }

  const apiBase = (env.POLAR_API_BASE || "https://api.polar.sh").replace(/\/+$/, "");

  // A network failure or a hung upstream must not turn into an unhandled
  // rejection (Cloudflare surfaces those as a 1101 error page, which the
  // marketing site's fetch() then can't distinguish from "worker is down").
  let response: Response;
  try {
    response = await fetch(
      `${apiBase}/v1/discounts/${encodeURIComponent(env.EARLY_BIRD_DISCOUNT_ID)}`,
      {
        headers: { Authorization: `Bearer ${env.POLAR_API_TOKEN}` },
        signal: AbortSignal.timeout(POLAR_FETCH_TIMEOUT_MS),
      },
    );
  } catch (error) {
    console.error("discount-count: Polar fetch failed", error instanceof Error ? error.message : String(error));
    return upstreamUnavailable();
  }

  if (!response.ok) {
    console.error("discount-count: Polar responded", response.status);
    return upstreamUnavailable();
  }

  let discount: { redemptions_count?: unknown; max_redemptions?: unknown };
  try {
    discount = await response.json();
  } catch {
    return upstreamUnavailable();
  }
  if (typeof discount.redemptions_count !== "number") {
    return upstreamUnavailable();
  }
  const total = typeof discount.max_redemptions === "number" ? discount.max_redemptions : null;

  return new Response(
    JSON.stringify({
      claimed: discount.redemptions_count,
      total,
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
      // once at unlock and never again (see desktop/src-tauri/src/polar.rs),
      // so today this is purely an ops/record-keeping signal, not something
      // that revokes access automatically.
      //
      // Log identifiers only. The full payload carries the buyer's name,
      // email and billing address; Cloudflare's log retention is not a
      // place that data has any business being (PRIVACY.md says Polar is
      // the processor for purchase data, and Polar's dashboard already has
      // the full record keyed by these ids).
      console.log(`polar webhook: ${event.type}`, JSON.stringify(eventSummary(event.data)));
    } else {
      console.log(`polar webhook: ignoring ${event.type}`);
    }

    return new Response(null, { status: 202 });
  },
} satisfies ExportedHandler<Env>;
