import { test, expect } from "@playwright/test";

async function registerFreshAccount(page: import("@playwright/test").Page) {
  const email = `e2e+sites+${Date.now()}@test.com`;
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Minimum 8 characters").fill("password123");
  await page.locator('form button[type="submit"]').click();
  // Not "Free plan" — is_pro is a single app-wide flag (not per-account), so
  // an earlier spec activating Pro in this same shared test database makes
  // every account Pro for the rest of the run. Assert on something that
  // doesn't depend on run order instead.
  await expect(
    page.getByRole("heading", { name: /Track the state of your entire license vault/i }),
  ).toBeVisible();
}

test("add a custom site, expand it, and remove it", async ({ page }) => {
  await registerFreshAccount(page);
  await page.goto("/sites");

  // Built-in sites render collapsed, one per row, no remove option.
  const appSumoRow = page.getByRole("button", { name: /AppSumo/ });
  await expect(appSumoRow).toBeVisible();
  await appSumoRow.click();
  await expect(page.getByText("Track local AppSumo purchases")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove site" })).toHaveCount(0);
  await appSumoRow.click(); // collapse back

  // Add a custom site — auto-connects, sorts alphabetically among the built-ins.
  await page.getByRole("button", { name: "Add a site" }).click();
  await page.getByPlaceholder("Big Deal Marketplace").fill("Zed Deals");
  await page.getByPlaceholder("https://example.com").fill("https://zeddeals.example.com");
  await page.getByRole("button", { name: "Add site" }).click();

  const zedRow = page.getByRole("button", { name: /Zed Deals/ });
  await expect(zedRow).toBeVisible();
  await zedRow.click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();

  // Remove requires a confirm click, not a single click.
  const removeButton = page.getByRole("button", { name: "Remove site" });
  await removeButton.click();
  await expect(page.getByRole("button", { name: "Confirm remove?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm remove?" }).click();

  await expect(page.getByText("Zed Deals")).toHaveCount(0);
});
