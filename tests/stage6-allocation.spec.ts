import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("global allocation preview is authenticated, explainable, and read-only", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  const localOrigin = "http://127.0.0.1:3100";
  const external: string[] = [];
  page.on("request", request => {
    if (request.url().startsWith("http") && new URL(request.url()).origin !== localOrigin) external.push(request.url());
  });

  await page.goto("/matches");
  const allocation = page.locator(".global-allocation");
  await expect(allocation.getByRole("heading", { name: "Global one-to-one allocation" })).toBeVisible();
  await expect(allocation.getByLabel("Profile classification")).toHaveValue("DEMO");
  await allocation.getByRole("button", { name: "Compute allocation preview" }).click();
  await expect(allocation.locator(".results-heading [role=status]")).toContainText("4 eligible profiles");
  await expect(allocation.getByText("Human review remains required")).toBeVisible();
  await expect(allocation.getByText("This preview creates no workflow or approval decision.")).toBeVisible();

  const response = await page.request.post("/api/workspace/matches/allocate", { headers: { Origin: localOrigin }, data: { kind: "DEMO" } });
  expect(response.ok()).toBe(true);
  const result = await response.json() as { pairs: { left: { id: string }; right: { id: string } }[]; maxCouples: number };
  const pairedIds = result.pairs.flatMap(pair => [pair.left.id, pair.right.id]);
  expect(pairedIds.length).toBe(new Set(pairedIds).size);
  expect(result.pairs.length).toBeLessThanOrEqual(result.maxCouples);
  expect(external).toEqual([]);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
