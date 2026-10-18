import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  deleteLicense: vi.fn(async () => undefined),
  getLicense: vi.fn(async () => ({
    id: "abc",
    product_name: "Tool",
    license_key: "KEY",
    status: "active",
    action_required: false,
    keepalive_days: null,
  })),
  markLicenseActive: vi.fn(),
  updateLicense: vi.fn(),
}));

vi.mock("#lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/api")>()),
  ...api,
}));
vi.mock("$app/navigation", () => ({ goto: vi.fn(async () => {}) }));
vi.mock("$app/state", () => ({
  page: { params: { id: "abc" } },
}));

import LicensePage from "../src/routes/licenses/[id]/+page.svelte";

describe("license delete confirmation", () => {
  beforeEach(() => {
    api.deleteLicense.mockClear();
  });

  async function renderLoaded() {
    render(LicensePage);
    return screen.findByRole("button", { name: "Delete" });
  }

  it("requires a second, explicit click before deleting", async () => {
    const btn = await renderLoaded();
    await fireEvent.click(btn);
    expect(api.deleteLicense).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole("button", { name: "Yes, delete permanently" }));
    expect(api.deleteLicense).toHaveBeenCalledWith("abc");
  });

  it("cancelling the confirmation keeps the license", async () => {
    const btn = await renderLoaded();
    await fireEvent.click(btn);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(api.deleteLicense).not.toHaveBeenCalled();
  });
});
