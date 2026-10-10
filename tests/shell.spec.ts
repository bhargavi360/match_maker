import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routes = ["dashboard", "profiles", "matches", "workflow", "email", "chat", "settings"];

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`all routes fit and pass automated accessibility at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    const externalRequests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (request.url().startsWith("http") && !request.url().startsWith("http://127.0.0.1:3100/")) externalRequests.push(request.url()); });
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const route of routes) {
        await page.goto(`/${route}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".preview-notice")).toHaveCount(0);
        const sizes = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
        expect(sizes.document, `${route} ${theme} horizontal overflow`).toBeLessThanOrEqual(sizes.viewport);
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        expect(result.violations, `${route} ${theme} accessibility`).toEqual([]);
        if (["dashboard", "profiles", "matches"].includes(route) && [1440, 390].includes(viewport.width)) {
          await page.screenshot({ path: `test-results/screenshots/${route}-${viewport.width}-${theme}.png`, fullPage: true });
        }
      }
    }
    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });
}

test("desktop collapse preserves navigation and the active indicator", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await page.locator(".sidebar").getByRole("link", { name: "Profiles", exact: true }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await expect(page.locator(".sidebar").getByRole("link", { name: "Profiles", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator(".sidebar .brand-name")).toBeVisible();
});

test("mobile drawer traps keyboard focus and restores it on close", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
  await expect(drawer).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await drawer.getByRole("button", { name: "Close navigation", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("link", { name: "Settings", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole("link", { name: "Profiles", exact: true }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await expect(drawer).not.toBeVisible();
  await trigger.click();
  await page.getByRole("button", { name: "Close navigation", exact: true }).click();
  await expect(trigger).toBeFocused();
});

test("skip link and account menu work by keyboard", async ({ page }) => {
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  const summary = page.locator(".account-menu summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Matchmaker account", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Synthetic account", { exact: true })).not.toBeVisible();
  await expect(summary).toBeFocused();
  const outline = await summary.evaluate(element => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
});

test("system theme follows the OS; explicit preference survives reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: /System/ })).toBeChecked();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: /^Dark/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["matchmaker-visual-theme"]);
  await page.getByRole("radio", { name: /System/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test("theme still toggles when browser storage is blocked", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Storage blocked", "SecurityError"); } }));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("local filters, empty reset, and synthetic profile dialog", async ({ page }) => {
  await page.goto("/profiles");
  await page.getByText("Design state examples", { exact: true }).click();
  await page.getByLabel("Search synthetic profiles").fill("hiking");
  await expect(page.locator(".preview-states .profile-card")).toHaveCount(2);
  await page.getByLabel("Location", { exact: true }).selectOption("Mumbai");
  await expect(page.getByRole("heading", { name: "No profiles in this view" })).toBeVisible();
  await page.locator(".empty-state").getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator(".preview-states .profile-card")).toHaveCount(4);
  const photoButton = page.getByRole("button", { name: "View Aanya's synthetic profile" });
  await photoButton.click();
  await expect(page.getByRole("dialog", { name: "Synthetic profile" })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await expect(page.getByText("No contact details are included in this preview.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(photoButton).toBeFocused();
});

test("loading and recoverable error states are explicitly previews", async ({ page }) => {
  await page.goto("/profiles");
  await page.getByText("Design state examples", { exact: true }).click();
  await page.getByText("Explore loading, error, and image fallback states", { exact: true }).click();
  await page.getByRole("button", { name: "Show loading preview" }).click();
  await expect(page.locator(".skeleton-card")).toHaveCount(4);
  await expect(page.getByText("Loading-state preview. No request is running.")).toBeVisible();
  await page.getByRole("button", { name: "Show error preview" }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Return to profiles" }).click();
  await expect(page.locator(".preview-states .profile-card")).toHaveCount(4);
});

test("every portrait loads and an unavailable portrait uses the bundled fallback", async ({ page, request }) => {
  for (const name of ["aanya.webp", "ishaan.webp", "lina.webp", "omar.webp", "fallback.svg"]) {
    const response = await request.get(`/demo/portraits/${name}`);
    expect(response.ok()).toBe(true);
    expect((await response.body()).length).toBeGreaterThan(100);
  }
  await page.route("**/demo/portraits/aanya.webp", route => route.abort());
  await page.goto("/profiles");
  await page.getByText("Design state examples", { exact: true }).click();
  const image = page.getByRole("img", { name: "Portrait unavailable for Aanya, a synthetic profile" });
  await expect(image).toHaveAttribute("src", "/demo/portraits/fallback.svg");
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test("workflow examples only change views and approval stays disabled", async ({ page }) => {
  await page.goto("/workflow");
  await page.getByText("Design state examples", {exact:true}).click();
  const example=page.locator(".preview-states");
  const explanation = example.getByRole("tab", { name: /Read Explanation/ });
  await expect(explanation).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Approve match unavailable" })).toBeDisabled();
  await explanation.focus();
  await page.keyboard.press("ArrowRight");
  await expect(example.getByRole("tab", { name: /Generate Email/ })).toBeFocused();
  await page.keyboard.press("End");
  await expect(example.getByRole("tab", { name: /Choose Delivery/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Send unavailable", exact: true })).toBeDisabled();
  await expect(page.getByText("Illustrative progress: step 3 of 5", { exact: true })).toBeVisible();
});

test("every workflow view fits mobile and meets automated accessibility checks", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/workflow");
  await page.getByText("Design state examples", {exact:true}).click();
  const example=page.locator(".preview-states");
  for (const label of ["Select Customer", "Review Matches", "Read Explanation", "Generate Email", "Choose Delivery"]) {
    await example.getByRole("tab", { name: new RegExp(label) }).click();
    await expect(example.getByRole("tabpanel")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await expect(page.getByText("Illustrative progress: step 3 of 5", { exact: true })).toBeVisible();
  }
});

test("selecting a candidate changes only its fixed explanation", async ({ page }) => {
  await page.goto("/matches");
  await page.getByText("Design state examples",{exact:true}).click();
  await page.getByRole("button", { name: "View breakdown", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aanya & Omar", exact: true })).toBeVisible();
  await expect(page.getByText("65%", { exact: true })).toBeVisible();
  await expect(page.locator(".factor-chart").getByText("Unknown", { exact: true })).toHaveCount(2);
  await expect(page.getByText("No match decision made", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test("draft edits are temporary and reset requires a clear local confirmation", async ({ page }) => {
  await page.goto("/email");
  await page.getByText("Design state examples", { exact: true }).click();
  const subject = page.getByLabel("Subject", { exact: true });
  const original = await subject.inputValue();
  await subject.fill("Temporary example edit");
  await expect(page.getByText("Temporary edits", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send unavailable" })).toBeDisabled();
  await page.getByRole("button", { name: "Reset preview" }).click();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(subject).toHaveValue("Temporary example edit");
  await page.getByRole("button", { name: "Reset preview" }).click();
  await page.getByRole("button", { name: "Reset text", exact: true }).click();
  await expect(subject).toHaveValue(original);
  await subject.fill("Not persisted");
  await page.reload();
  await expect(subject).toHaveValue(original);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test("chat exposes persistent local tools and no scripted assistant", async ({ page }) => {
  await page.goto("/chat");
  await expect(page.getByRole("button", { name: "New conversation", exact: true })).toBeVisible();
  await expect(page.getByText(/Local tools.*Gemini unavailable/)).toBeVisible();
  await expect(page.getByLabel("Chat message unavailable in preview")).toHaveCount(0);
  await expect(page.getByText("Scripted response", { exact: false })).toHaveCount(0);
});

test("reduced motion disables decorative animation and transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/profiles");
  await page.getByText("Design state examples", { exact: true }).click();
  await page.getByText("Explore loading, error, and image fallback states", { exact: true }).click();
  await page.getByRole("button", { name: "Show loading preview" }).click();
  expect(await page.locator(".skeleton").first().evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  expect(await page.locator("html").evaluate(element => getComputedStyle(element).scrollBehavior)).toBe("auto");
  expect(await page.locator(".button").first().evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
});

test("root renders the public landing page and missing routes have a useful fallback", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find Your Perfect Match" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome back!" })).toBeVisible();
  const response = await page.goto("/not-a-preview-route");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "A different path, perhaps?" })).toBeVisible();
  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
