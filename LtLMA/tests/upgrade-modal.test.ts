import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import UpgradeModal from "../src/lib/components/UpgradeModal.svelte";
import { paywallOpen } from "../src/lib/stores/entitlement";

afterEach(() => paywallOpen.set(false));

describe("upgrade dialog accessibility", () => {
  it("keeps keyboard focus in the dialog and restores the trigger on Escape", async () => {
    paywallOpen.set(false);
    const trigger = document.createElement("button");
    trigger.textContent = "Upgrade";
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(UpgradeModal);

    paywallOpen.set(true);
    const link = await screen.findByRole("link", { name: "Check current price at Polar" });
    await waitFor(() => expect(document.activeElement).toBe(link));
    expect(link.getAttribute("href")).toContain("polar_cl_78OH9xU4qiWkVMEjbUpLYe7amh6I1Yw1cxpp50aBwuB");

    await fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Maybe later" }));
    await fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(link);

    await fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    unmount();
    trigger.remove();
  });
});
