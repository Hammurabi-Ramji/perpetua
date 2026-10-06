import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => vi.useRealTimers());

  async function renderLoaded() {
    render(LicensePage);
    const found = await screen.findByRole("button", { name: "Delete" });
    vi.useFakeTimers();
    return found;
  }

  it("requires a second click before deleting", async () => {
    const btn = await renderLoaded();
    await fireEvent.click(btn);
    expect(api.deleteLicense).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole("button", { name: "Confirm delete?" }));
    expect(api.deleteLicense).toHaveBeenCalledWith("abc");
  });

  it("auto-disarms after a few seconds", async () => {
    const btn = await renderLoaded();
    await fireEvent.click(btn);
    expect(screen.getByRole("button", { name: "Confirm delete?" })).toBeTruthy();
    await vi.advanceTimersByTimeAsync(5000);
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.deleteLicense).not.toHaveBeenCalled();
  });
});
