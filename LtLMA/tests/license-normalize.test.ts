import { describe, it, expect } from "vitest";

import { normalizeLicenseInput } from "$lib/api";
import { emptyLicense } from "$lib/types";

describe("normalizeLicenseInput", () => {
  it("converts keep-alive days to a number and blanks to null", () => {
    const out = normalizeLicenseInput({
      ...emptyLicense(),
      product_name: "Rytr",
      license_key: "K1",
      keepalive_days: "90",
    });
    expect(out.keepalive_days).toBe(90);
    expect(out.last_active).toBeNull();
    expect(out.source_site).toBeNull();
  });

  it("treats a blank keep-alive cadence as null (no tracking)", () => {
    const out = normalizeLicenseInput({
      ...emptyLicense(),
      product_name: "Rytr",
      license_key: "K1",
    });
    expect(out.keepalive_days).toBeNull();
  });
});
