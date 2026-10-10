import { test, expect } from "@playwright/test";

// Renders a synthetic receipt image in-page (canvas) and drops it onto the
// upload input via DataTransfer — Playwright's setInputFiles needs a real
// file on disk/buffer, but generating one from Node would need a canvas
// library this repo doesn't otherwise depend on. Building it in the page's
// own context needs nothing extra and exercises the exact same code path a
// real drag-and-drop or file-picker upload would.
async function uploadSyntheticReceipt(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 320;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    ctx.font = "28px Arial";
    const lines = [
      "StackSocial Order Receipt",
      "Product: AI Magicx Lifetime Deal",
      "License Key: RU-1Bdnu8c94",
      "Purchase Date: 10/24/2025",
      "Expires: 10/24/2026",
      "Total Paid: $49.00",
    ];
    lines.forEach((line, i) => ctx.fillText(line, 30, 50 + i * 45));

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png"),
    );
    const file = new File([blob], "e2e-receipt.png", { type: "image/png" });

    const input = document.querySelector<HTMLInputElement>(".ocr-upload input[type=file]")!;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

test("uploading a screenshot autofills license key, dates, and amount", async ({ page }) => {
  const email = `e2e+ocr+${Date.now()}@test.com`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Minimum 8 characters").fill("password123");
  await page.locator('form button[type="submit"]').click();

  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByPlaceholder("Figma Pro")).toBeVisible();

  await uploadSyntheticReceipt(page);

  // OCR runs client-side and can take a few seconds on a cold worker.
  await expect(page.getByText(/Filled in what was found/)).toBeVisible({ timeout: 30_000 });

  await expect(page.getByPlaceholder("AAAA-BBBB-CCCC")).toHaveValue("RU-1Bdnu8c94");
  await expect(page.locator('label:has-text("Purchase date") input')).toHaveValue("2025-10-24");
  await expect(page.locator('label:has-text("Expiry date") input')).toHaveValue("2026-10-24");
  await expect(page.getByPlaceholder(/purchase notes/i)).toHaveValue(/\$49\.00/);

  // Manually-entered values are never clobbered by a later autofill — type
  // over the extracted key, then re-upload and confirm it survives.
  await page.getByPlaceholder("AAAA-BBBB-CCCC").fill("HAND-TYPED-KEY");
  await uploadSyntheticReceipt(page);
  await expect(page.getByText(/Filled in what was found/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByPlaceholder("AAAA-BBBB-CCCC")).toHaveValue("HAND-TYPED-KEY");
});
