import { expect, test } from "@playwright/test";

test("landing, login, and create-account links complete a second-user sign-in", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Login", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get Started", exact: true })).toBeVisible();
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);

  await page.getByRole("link", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Create Account", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByRole("link", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/");
  await page.getByRole("link", { name: "Get Started", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  const email = `second-${Date.now()}@example.invalid`;
  const password = "Synthetic-browser-second-passphrase-2026";
  await page.getByLabel("Name", { exact: true }).fill("Browser Second Account");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill("mismatched-passphrase");
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Passwords do not match");

  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await expect(page.getByRole("status")).toContainText("Your account was created");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Unable to sign in");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
