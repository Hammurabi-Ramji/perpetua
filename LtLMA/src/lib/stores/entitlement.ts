import { writable } from "svelte/store";

import { ApiError, getEntitlement } from "$lib/api";
import type { Entitlement } from "$lib/types";

// Shared entitlement state so the plan banner and the upgrade paywall stay in
// sync across every page (dashboard, licenses, vault import).
export const entitlement = writable<Entitlement | null>(null);

// Controls the global upgrade modal mounted once in the root layout.
export const paywallOpen = writable(false);

/** Re-reads entitlement from the backend and updates the shared store. */
export async function refreshEntitlement() {
  try {
    entitlement.set(await getEntitlement());
  } catch {
    entitlement.set(null);
  }
}

export function openPaywall() {
  paywallOpen.set(true);
}

export function closePaywall() {
  paywallOpen.set(false);
}

/**
 * Inspect an error thrown by an add/import call. If it's the free-tier cap
 * (HTTP 402), open the upgrade paywall and report it as handled so callers can
 * skip showing a raw error banner. Returns false for any other error.
 */
export function handleAddError(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 402) {
    void refreshEntitlement();
    openPaywall();
    return true;
  }
  return false;
}
