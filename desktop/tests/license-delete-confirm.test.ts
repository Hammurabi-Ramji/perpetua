import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";

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

vi.mock("$lib/api", () => api);
// Vitest resolves Svelte's SSR entry where onMount never fires; run it inline.
vi.mock("svelte", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // testing-library probes Svelte 5's mount; declare it absent (Svelte 4).
    mount: undefined,
    flushSync: undefined,
    unmount: undefined,
    hydrate: undefined,
    onMount: (fn: () => unknown) => {
      void fn();
    },
  };
});
vi.mock("$app/navigation", () => ({ goto: vi.fn(async () => {}) }));
vi.mock("$app/stores", () => ({
  page: writable({ params: { id: "abc" } }),
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
