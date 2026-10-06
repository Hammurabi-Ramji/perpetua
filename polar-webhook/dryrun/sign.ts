// Standard Webhooks signing, as Polar delivers it. Used only by the dry-run
// harness and its tests; the worker itself only *verifies* (via @polar-sh/sdk).
//
// signed content = `${webhook-id}.${webhook-timestamp}.${raw body}`
// header         = `v1,<base64(HMAC-SHA256(key, signed content))>`
//
// Two key encodings are accepted by the SDK's verifier and both occur in the
// wild, so the harness can exercise each:
//   "utf8"   — the secret string's own bytes (what Polar's dashboard secret is)
//   "base64" — `whsec_<base64>` decoded (the canonical Standard Webhooks form)

export type KeyEncoding = "utf8" | "base64";

export interface SignedDelivery {
  headers: Record<string, string>;
  body: string;
}

function keyBytes(secret: string, encoding: KeyEncoding): Uint8Array {
  if (encoding === "utf8") return new TextEncoder().encode(secret);
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return Uint8Array.from(Buffer.from(raw, "base64"));
}

export async function signature(
  id: string,
  timestampSeconds: number,
  body: string,
  secret: string,
  encoding: KeyEncoding = "utf8",
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes(secret, encoding),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestampSeconds}.${body}`),
  );
  return `v1,${Buffer.from(mac).toString("base64")}`;
}

export async function signedDelivery(
  event: { type: string; data: unknown },
  secret: string,
  opts: {
    id?: string;
    timestampSeconds?: number;
    encoding?: KeyEncoding;
  } = {},
): Promise<SignedDelivery> {
  const body = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
  const id = opts.id ?? `msg_${crypto.randomUUID().replaceAll("-", "")}`;
  const ts = opts.timestampSeconds ?? Math.floor(Date.now() / 1000);
  return {
    body,
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(ts),
      "webhook-signature": await signature(id, ts, body, secret, opts.encoding ?? "utf8"),
    },
  };
}

/** Random test secret in Polar's `polar_whs_...` style. Never logged. */
export function generateTestSecret(): string {
  return `polar_whs_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
}
