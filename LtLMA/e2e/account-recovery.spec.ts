import { test, expect } from "@playwright/test";

test("backup email and SMTP settings persist across reload", async ({ page }) => {
  const email = `e2e+recovery+${Date.now()}@test.com`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Minimum 8 characters").fill("password123");
  await page.locator('form button[type="submit"]').click();
  await page.getByRole("button", { name: "Skip" }).click();

  await page.goto("/reminders");
  await page.getByPlaceholder("backup@example.com").fill("backup@example.com");
  await page.getByPlaceholder("smtp.gmail.com").fill("smtp.example.com");
  await page.getByPlaceholder("587").fill("587");
  await page.getByRole("button", { name: "Save recovery settings" }).click();
  await expect(page.getByText("Recovery settings saved locally.")).toBeVisible();

  await page.reload();
  await expect(page.getByPlaceholder("backup@example.com")).toHaveValue("backup@example.com");
  await expect(page.getByPlaceholder("smtp.gmail.com")).toHaveValue("smtp.example.com");
});

test("forgot password rejects a wrong code without leaking whether the account exists", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();

  await page.getByPlaceholder("you@example.com").fill("nobody-e2e@test.com");
  await page.getByRole("button", { name: "Send reset code" }).click();

  // Always the same generic message, whether or not the account/backup email exists.
  await expect(
    page.getByText(/if that account has a backup email configured/i),
  ).toBeVisible();

  await page.getByPlaceholder("123456").fill("000000");
  await page.getByPlaceholder("Minimum 8 characters").fill("newpassword123");
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page.getByText("Invalid or expired code.")).toBeVisible();
});
