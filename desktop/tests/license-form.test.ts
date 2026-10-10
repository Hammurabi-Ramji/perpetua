import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LicenseForm from "../src/lib/components/LicenseForm.svelte";
import { emptyLicense } from "../src/lib/types";

vi.mock("$lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/api")>();
  return {
    ...actual,
    suggestVendorPolicy: vi.fn().mockResolvedValue({
      matched: false,
      keepalive_days: null,
      vendor: null,
      confidence: null,
      source: null,
      last_verified: null,
      policy_id: null,
      dataset_version: 1,
      message: "unknown — set keep-alive days manually",
    }),
  };
});

describe("Perpetua license form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits the current model", async () => {
    const model = emptyLicense();
    const submitSpy = vi.fn();
    const { component } = render(LicenseForm, {
      model,
      submitLabel: "Create license",
      busy: false,
    });

    component.$on("submit", submitSpy);

    await fireEvent.input(screen.getByPlaceholderText("Figma Pro"), {
      target: { value: "Test Product" },
    });
    await fireEvent.input(screen.getByPlaceholderText("AAAA-BBBB-CCCC"), {
      target: { value: "TEST-KEY" },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: "Create license" }),
    );

    expect(submitSpy).toHaveBeenCalled();
    expect(submitSpy.mock.calls[0][0].detail.product_name).toBe("Test Product");
    expect(submitSpy.mock.calls[0][0].detail.license_key).toBe("TEST-KEY");
  });
});
