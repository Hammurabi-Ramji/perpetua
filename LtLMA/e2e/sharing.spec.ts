import { test, expect } from "@playwright/test";

// The Pro/free gate itself is covered thoroughly at the service-test level
// (src-tauri/src/tests.rs: sharing_requires_pro_and_grants_access_to_owners_vault)
// in an isolated temp database. It's deliberately not re-asserted here:
// is_pro is a single app-wide flag (not per-account — see services.rs), so in
// this shared E2E database an earlier spec activating Pro (paywall.spec.ts)
// makes every account Pro for the rest of the run, which would make a
// "free tier is gated" UI assertion here pass or fail depending on run
// order rather than on the behavior actually being tested.
test("redeeming an invite fails cleanly with a wrong code", async ({ page }) => {
  const email = `e2e+sharing+${Date.now()}@test.com`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Minimum 8 characters").fill("password123");
  await page.locator('form button[type="submit"]').click();
  await page.getByRole("button", { name: "Skip" }).click();

  await page.goto("/reminders");

  // Redeeming is available regardless of the current account's own plan
  // (the invitee doesn't need to be Pro themselves).
  await page.getByPlaceholder("123456").fill("000000");
  await page.getByRole("button", { name: "Redeem code" }).click();
  await expect(page.getByText("Invalid or expired invite code.")).toBeVisible();
});
