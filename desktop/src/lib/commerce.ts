// Commerce constants baked in at build time (Vite `VITE_*` env; see
// `.env.example` and `build-release.ps1`). Nothing here is secret — it is all
// shown to the customer — but keeping it out of the components means a price
// change or a new Polar checkout link is a release-config change, not a
// code change, and the UI can degrade sensibly when a value is missing.

function env(name: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Polar checkout link for the Pro lifetime unlock. `undefined` = not configured for this build. */
export const CHECKOUT_URL: string | undefined = (() => {
  const url = env("VITE_PERPETUA_CHECKOUT_URL");
  // The placeholder that used to live in the component must never ship.
  if (!url || url.includes("<") || !url.startsWith("https://")) return undefined;
  return url;
})();

/** Display price for the one-time Pro purchase. Must match the Polar product. */
export const PRO_PRICE: string = env("VITE_PERPETUA_PRO_PRICE") ?? "$49.99";

/** Public product page — where a user can buy when the in-app link isn't configured. */
export const PRODUCT_URL: string =
  env("VITE_PERPETUA_PRODUCT_URL") ?? "https://perpetua.hammurabi.click";

/** Support mailbox shown in-app. Keep in sync with legal/SUPPORT.md. */
export const SUPPORT_EMAIL: string =
  env("VITE_PERPETUA_SUPPORT_EMAIL") ?? "support@hammurabi.click";

/** Where the "Buy" button should send the user. Falls back to the product page. */
export const BUY_URL: string = CHECKOUT_URL ?? PRODUCT_URL;

/** True when the build has a real checkout link (not just the product page). */
export const CHECKOUT_CONFIGURED: boolean = CHECKOUT_URL !== undefined;
