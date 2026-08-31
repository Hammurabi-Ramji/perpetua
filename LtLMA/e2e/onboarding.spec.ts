import { test, expect } from "@playwright/test";

test("first-time onboarding banner opens the license form and dismisses permanently", async ({
  page,
}) => {
  const email = `e2e+onboard+${Date.now()}@test.com`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Minimum 8 characters").fill("password123");
  await page.locator('form button[type="submit"]').click();

  await expect(page.getByRole("heading", { name: "Welcome to Perpetua" })).toBeVisible();

  // "Get started" dismisses the banner AND opens the license form in one click.
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Perpetua" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Figma Pro")).toBeVisible();

  // Dismissal is persisted server-side, not just client state.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome to Perpetua" })).toHaveCount(0);
});

test("skipping onboarding dismisses it without opening the form", async ({ page }) => {
  const email = `e2e+onboard-skip+${Date.now()}@test.com`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Minimum 8 characters").fill("password123");
  await page.locator('form button[type="submit"]').click();

  await expect(page.getByRole("heading", { name: "Welcome to Perpetua" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();

  await expect(page.getByRole("heading", { name: "Welcome to Perpetua" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Figma Pro")).toHaveCount(0);
});
