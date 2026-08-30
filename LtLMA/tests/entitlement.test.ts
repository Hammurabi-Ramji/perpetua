import { describe, it, expect } from "vitest";
import { get } from "svelte/store";

import { ApiError } from "$lib/api";
import {
  handleAddError,
  paywallOpen,
  closePaywall,
} from "$lib/stores/entitlement";

describe("handleAddError", () => {
  it("opens the upgrade paywall on a 402 and reports handled", () => {
    closePaywall();
    expect(handleAddError(new ApiError("cap reached", 402))).toBe(true);
    expect(get(paywallOpen)).toBe(true);
  });

  it("leaves other errors for the caller to surface", () => {
    closePaywall();
    expect(handleAddError(new ApiError("server error", 500))).toBe(false);
    expect(handleAddError(new Error("network"))).toBe(false);
    expect(get(paywallOpen)).toBe(false);
  });
});
