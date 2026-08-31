import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";

// The dev/test backend runs offline (no Polar org id baked in), so activation
// accepts a self-issued key minted by the same binary — exactly what the
// production flow does, only the key source differs (Polar emails it for real).
const BIN = path.join(
  "src-tauri",
  "target",
  "debug",
  process.platform === "win32" ? "perpetua.exe" : "perpetua",
);

function mintKey(ref: string): string {
  return execSync(`"${BIN}" mint-key ${ref}`).toString().trim();
}

async function addLicense(page: Page, product: string, key: string) {
  // The form collapses behind this toggle after every successful add, but
  // stays open after a failed one (e.g. the paywall) — only open it if it's
  // not already open.
  const productInput = page.getByPlaceholder("Figma Pro");
  if (!(await productInput.isVisible())) {
    await page.getByRole("button", { name: "Add a license" }).click();
  }
  await productInput.fill(product);
  await page.getByPlaceholder("AAAA-BBBB-CCCC").fill(key);
  await page.getByRole("button", { name: "Add license" }).click();
}

test("free cap blocks the 4th add, then a key unlocks unlimited", async ({
  page,
}) => {
  const email = `e2e+${Date.now()}@test.com`;

  // Register a fresh local account.
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Minimum 8 characters").fill("password123");
  await page.locator('form button[type="submit"]').click();

  // First-time onboarding greets new accounts — dismiss it to reach the form.
  await page.getByRole("button", { name: "Skip" }).click();

  // Land on the dashboard, free plan.
  await expect(
    page.getByRole("heading", {
      name: /Track the state of your entire license vault/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Free plan/)).toBeVisible();

  // First three adds succeed; the banner counts up.
  for (let i = 1; i <= 3; i++) {
    await addLicense(page, `Deal ${i}`, `KEY-${i}`);
    await expect(page.getByText(new RegExp(`${i}/3`))).toBeVisible();
  }

  // The 4th add hits the cap and opens the upgrade paywall.
  await addLicense(page, "Deal 4", "KEY-4");
  await expect(
    page.getByRole("heading", { name: "Unlock Perpetua Pro" }),
  ).toBeVisible();

  // Paste a minted key and activate.
  await page.locator("#activation-key").fill(mintKey("e2e"));
  await page.getByRole("button", { name: "Activate" }).click();

  // Paywall closes; the banner flips to Pro.
  await expect(
    page.getByRole("heading", { name: "Unlock Perpetua Pro" }),
  ).toBeHidden();
  await expect(page.getByText(/Perpetua Pro/)).toBeVisible();

  // The previously-blocked add now succeeds without a paywall.
  await addLicense(page, "Deal 4", "KEY-4");
  await expect(
    page.getByRole("heading", { name: "Unlock Perpetua Pro" }),
  ).toBeHidden();
});
